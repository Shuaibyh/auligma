export async function up(knex) {
  await knex.schema.alterTable('assessment_versions', table => {
    table.string('score_release_policy', 24).notNullable().defaultTo('after_close');
    table.string('solution_release_policy', 24).notNullable().defaultTo('never');
    table.check("score_release_policy IN ('immediate','after_close')", [], 'assessment_versions_score_release_ck');
    table.check("solution_release_policy IN ('never','after_close')", [], 'assessment_versions_solution_release_ck');
  });

  await knex.raw('ALTER TABLE attempts DROP CONSTRAINT attempts_status_ck, DROP CONSTRAINT attempts_submission_ck');
  await knex.schema.alterTable('attempts', table => {
    table.unique(['id', 'classroom_id', 'student_user_id'], { indexName: 'attempts_grade_scope_unique' });
    table.check("status IN ('in_progress','submitted','grading','graded','expired','invalidated')", [], 'attempts_status_ck');
    table.check(`
      (submission_key IS NULL) = (submitted_at IS NULL)
      AND (status NOT IN ('submitted','grading','graded') OR (submitted_at IS NOT NULL AND submission_key IS NOT NULL))
    `, [], 'attempts_submission_ck');
  });

  await knex.schema.createTable('attempt_grades', table => {
    table.uuid('id').primary();
    table.uuid('attempt_id').notNullable();
    table.uuid('classroom_id').notNullable();
    table.uuid('student_user_id').notNullable();
    table.integer('revision').notNullable();
    table.decimal('score', 10, 2).notNullable();
    table.decimal('max_score', 10, 2).notNullable();
    table.string('status', 16).notNullable();
    table.string('source', 16).notNullable();
    table.boolean('review_required').notNullable().defaultTo(false);
    table.uuid('graded_by').references('user_id').inTable('teacher_profiles').onDelete('RESTRICT');
    table.uuid('operation_key').notNullable();
    table.text('adjustment_reason');
    table.timestamp('graded_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
    table.foreign(['attempt_id', 'classroom_id', 'student_user_id'], 'attempt_grades_attempt_scope_fk')
      .references(['id', 'classroom_id', 'student_user_id']).inTable('attempts').onDelete('RESTRICT');
    table.unique(['attempt_id', 'revision'], { indexName: 'attempt_grades_revision_unique' });
    table.unique(['attempt_id', 'operation_key'], { indexName: 'attempt_grades_operation_unique' });
    table.unique(['id', 'attempt_id'], { indexName: 'attempt_grades_item_scope_unique' });
    table.check('revision >= 1', [], 'attempt_grades_revision_ck');
    table.check('score >= 0 AND max_score > 0 AND score <= max_score', [], 'attempt_grades_score_ck');
    table.check("status IN ('provisional','final')", [], 'attempt_grades_status_ck');
    table.check("source IN ('system','teacher')", [], 'attempt_grades_source_ck');
    table.check("(source = 'system' AND graded_by IS NULL AND adjustment_reason IS NULL) OR (source = 'teacher' AND graded_by IS NOT NULL AND length(trim(adjustment_reason)) >= 10)", [], 'attempt_grades_author_ck');
    table.check("(status = 'provisional') = review_required", [], 'attempt_grades_review_ck');
    table.index(['classroom_id', 'status', 'graded_at'], 'attempt_grades_classroom_status_idx');
    table.index(['student_user_id', 'graded_at'], 'attempt_grades_student_idx');
  });

  await knex.schema.createTable('attempt_item_grades', table => {
    table.uuid('id').primary();
    table.uuid('attempt_grade_id').notNullable();
    table.uuid('attempt_id').notNullable();
    table.uuid('attempt_item_id').notNullable();
    table.decimal('points_awarded', 10, 2).notNullable();
    table.decimal('max_points', 10, 2).notNullable();
    table.string('outcome', 24).notNullable();
    table.string('source', 16).notNullable();
    table.foreign(['attempt_grade_id', 'attempt_id'], 'attempt_item_grades_grade_scope_fk')
      .references(['id', 'attempt_id']).inTable('attempt_grades').onDelete('RESTRICT');
    table.foreign(['attempt_item_id', 'attempt_id'], 'attempt_item_grades_item_scope_fk')
      .references(['id', 'attempt_id']).inTable('attempt_items').onDelete('RESTRICT');
    table.unique(['attempt_grade_id', 'attempt_item_id'], { indexName: 'attempt_item_grades_item_unique' });
    table.check('points_awarded >= 0 AND max_points > 0 AND points_awarded <= max_points', [], 'attempt_item_grades_points_ck');
    table.check("outcome IN ('correct','incorrect','unanswered','pending_review','adjusted')", [], 'attempt_item_grades_outcome_ck');
    table.check("source IN ('system','teacher')", [], 'attempt_item_grades_source_ck');
    table.check("outcome <> 'pending_review' OR (source = 'system' AND points_awarded = 0)", [], 'attempt_item_grades_pending_ck');
    table.index(['attempt_id', 'attempt_grade_id'], 'attempt_item_grades_attempt_idx');
  });

  await knex.raw(`
    CREATE FUNCTION auligma_protect_grade() RETURNS trigger AS $$
    BEGIN
      RAISE EXCEPTION 'grade revisions are immutable' USING ERRCODE = '55000';
    END;
    $$ LANGUAGE plpgsql;
    CREATE TRIGGER attempt_grades_immutable
      BEFORE UPDATE OR DELETE ON attempt_grades
      FOR EACH ROW EXECUTE FUNCTION auligma_protect_grade();
    CREATE TRIGGER attempt_item_grades_immutable
      BEFORE UPDATE OR DELETE ON attempt_item_grades
      FOR EACH ROW EXECUTE FUNCTION auligma_protect_grade();

    CREATE FUNCTION auligma_validate_grade_total() RETURNS trigger AS $$
    DECLARE item_score numeric(10,2); item_max numeric(10,2); expected_count integer; actual_count integer;
    BEGIN
      SELECT COALESCE(sum(points_awarded), 0), COALESCE(sum(max_points), 0), count(*)
        INTO item_score, item_max, actual_count
        FROM attempt_item_grades WHERE attempt_grade_id = NEW.id;
      SELECT count(*) INTO expected_count FROM attempt_items WHERE attempt_id = NEW.attempt_id;
      IF actual_count <> expected_count OR item_score <> NEW.score OR item_max <> NEW.max_score THEN
        RAISE EXCEPTION 'grade total does not match item grades' USING ERRCODE = '23514';
      END IF;
      RETURN NULL;
    END;
    $$ LANGUAGE plpgsql;
    CREATE CONSTRAINT TRIGGER attempt_grades_total_guard
      AFTER INSERT ON attempt_grades DEFERRABLE INITIALLY DEFERRED
      FOR EACH ROW EXECUTE FUNCTION auligma_validate_grade_total();

    CREATE OR REPLACE FUNCTION auligma_protect_attempt() RETURNS trigger AS $$
    BEGIN
      IF TG_OP = 'DELETE' THEN
        RAISE EXCEPTION 'attempts cannot be deleted' USING ERRCODE = '55000';
      END IF;
      IF OLD.assessment_version_id IS DISTINCT FROM NEW.assessment_version_id
        OR OLD.classroom_id IS DISTINCT FROM NEW.classroom_id
        OR OLD.student_user_id IS DISTINCT FROM NEW.student_user_id
        OR OLD.enrollment_id IS DISTINCT FROM NEW.enrollment_id
        OR OLD.attempt_number IS DISTINCT FROM NEW.attempt_number
        OR OLD.start_key IS DISTINCT FROM NEW.start_key
        OR OLD.started_at IS DISTINCT FROM NEW.started_at
        OR OLD.expires_at IS DISTINCT FROM NEW.expires_at
        OR (OLD.submitted_at IS NOT NULL AND OLD.submitted_at IS DISTINCT FROM NEW.submitted_at)
        OR (OLD.submission_key IS NOT NULL AND OLD.submission_key IS DISTINCT FROM NEW.submission_key)
        OR NEW.version <= OLD.version THEN
        RAISE EXCEPTION 'attempt identity or version transition is not allowed' USING ERRCODE = '55000';
      END IF;
      IF NOT (
        (OLD.status = 'in_progress' AND NEW.status IN ('in_progress','submitted','expired','invalidated'))
        OR (OLD.status = 'submitted' AND NEW.status IN ('grading','invalidated'))
        OR (OLD.status = 'grading' AND NEW.status IN ('graded','invalidated'))
      ) THEN
        RAISE EXCEPTION 'attempt status transition is not allowed' USING ERRCODE = '55000';
      END IF;
      RETURN NEW;
    END;
    $$ LANGUAGE plpgsql;
  `);
}

export async function down(knex) {
  await knex.raw(`
    DROP TRIGGER IF EXISTS attempt_grades_total_guard ON attempt_grades;
    DROP FUNCTION IF EXISTS auligma_validate_grade_total();
    DROP TRIGGER IF EXISTS attempt_item_grades_immutable ON attempt_item_grades;
    DROP TRIGGER IF EXISTS attempt_grades_immutable ON attempt_grades;
    DROP FUNCTION IF EXISTS auligma_protect_grade();
  `);
  await knex.schema.dropTableIfExists('attempt_item_grades');
  await knex.schema.dropTableIfExists('attempt_grades');
  // El esquema anterior representa una corrección terminada como una entrega.
  // Solo se usa al probar el rollback aislado; respuestas y constancia se conservan.
  await knex.raw(`
    ALTER TABLE attempts DISABLE TRIGGER attempts_transition_guard;
    UPDATE attempts SET status = 'submitted', version = version + 1, last_activity_at = clock_timestamp()
      WHERE status IN ('grading', 'graded');
    ALTER TABLE attempts ENABLE TRIGGER attempts_transition_guard;
  `);
  await knex.raw('ALTER TABLE attempts DROP CONSTRAINT attempts_status_ck, DROP CONSTRAINT attempts_submission_ck');
  await knex.schema.alterTable('attempts', table => {
    table.dropUnique(['id', 'classroom_id', 'student_user_id'], 'attempts_grade_scope_unique');
  });
  await knex.schema.alterTable('attempts', table => {
    table.check("status IN ('in_progress','submitted','expired','invalidated')", [], 'attempts_status_ck');
    table.check("(status = 'submitted') = (submitted_at IS NOT NULL AND submission_key IS NOT NULL)", [], 'attempts_submission_ck');
  });
  await knex.raw(`
    CREATE OR REPLACE FUNCTION auligma_protect_attempt() RETURNS trigger AS $$
    BEGIN
      IF TG_OP = 'DELETE' THEN
        RAISE EXCEPTION 'attempts cannot be deleted' USING ERRCODE = '55000';
      END IF;
      IF OLD.assessment_version_id IS DISTINCT FROM NEW.assessment_version_id
        OR OLD.classroom_id IS DISTINCT FROM NEW.classroom_id
        OR OLD.student_user_id IS DISTINCT FROM NEW.student_user_id
        OR OLD.enrollment_id IS DISTINCT FROM NEW.enrollment_id
        OR OLD.attempt_number IS DISTINCT FROM NEW.attempt_number
        OR OLD.start_key IS DISTINCT FROM NEW.start_key
        OR OLD.started_at IS DISTINCT FROM NEW.started_at
        OR OLD.expires_at IS DISTINCT FROM NEW.expires_at
        OR NEW.version <= OLD.version THEN
        RAISE EXCEPTION 'attempt identity or version transition is not allowed' USING ERRCODE = '55000';
      END IF;
      IF OLD.status <> 'in_progress' OR NEW.status NOT IN ('in_progress','submitted','expired','invalidated') THEN
        RAISE EXCEPTION 'attempt status transition is not allowed' USING ERRCODE = '55000';
      END IF;
      RETURN NEW;
    END;
    $$ LANGUAGE plpgsql;
  `);
  await knex.schema.alterTable('assessment_versions', table => {
    table.dropChecks('assessment_versions_score_release_ck', 'assessment_versions_solution_release_ck');
    table.dropColumns('score_release_policy', 'solution_release_policy');
  });
}
