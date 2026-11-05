export async function up(knex) {
  await knex.schema.alterTable('enrollments', table => {
    table.unique(['id', 'classroom_id', 'student_user_id'], { indexName: 'enrollments_attempt_scope_unique' });
  });
  await knex.schema.alterTable('assessment_version_items', table => {
    table.unique(['id', 'assessment_version_id'], { indexName: 'assessment_version_items_attempt_unique' });
  });

  await knex.schema.createTable('attempts', table => {
    table.uuid('id').primary();
    table.uuid('assessment_version_id').notNullable();
    table.uuid('classroom_id').notNullable();
    table.uuid('student_user_id').notNullable();
    table.uuid('enrollment_id').notNullable();
    table.integer('attempt_number').notNullable().defaultTo(1);
    table.string('status', 24).notNullable().defaultTo('in_progress');
    table.uuid('start_key').notNullable();
    table.uuid('submission_key');
    table.timestamp('started_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
    table.timestamp('expires_at', { useTz: true });
    table.timestamp('submitted_at', { useTz: true });
    table.timestamp('last_activity_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
    table.integer('version').notNullable().defaultTo(1);
    table.foreign(['assessment_version_id', 'classroom_id'], 'attempts_assessment_scope_fk')
      .references(['id', 'classroom_id']).inTable('assessment_versions').onDelete('RESTRICT');
    table.foreign(['enrollment_id', 'classroom_id', 'student_user_id'], 'attempts_enrollment_scope_fk')
      .references(['id', 'classroom_id', 'student_user_id']).inTable('enrollments').onDelete('RESTRICT');
    table.unique(['assessment_version_id', 'student_user_id', 'attempt_number'], { indexName: 'attempts_number_unique' });
    table.unique(['student_user_id', 'start_key'], { indexName: 'attempts_start_key_unique' });
    table.unique(['student_user_id', 'submission_key'], { indexName: 'attempts_submission_key_unique' });
    table.unique(['id', 'assessment_version_id'], { indexName: 'attempts_version_scope_unique' });
    table.check('attempt_number >= 1', [], 'attempts_number_ck');
    table.check('version >= 1', [], 'attempts_version_ck');
    table.check("status IN ('in_progress','submitted','expired','invalidated')", [], 'attempts_status_ck');
    table.check("(status = 'submitted') = (submitted_at IS NOT NULL AND submission_key IS NOT NULL)", [], 'attempts_submission_ck');
    table.check('expires_at IS NULL OR expires_at > started_at', [], 'attempts_expiration_ck');
    table.index(['classroom_id', 'student_user_id', 'status'], 'attempts_student_status_idx');
    table.index(['assessment_version_id', 'student_user_id'], 'attempts_activity_student_idx');
  });
  await knex.raw(`CREATE UNIQUE INDEX attempts_one_active_idx
    ON attempts(assessment_version_id, student_user_id) WHERE status = 'in_progress'`);

  await knex.schema.createTable('attempt_items', table => {
    table.uuid('id').primary();
    table.uuid('attempt_id').notNullable();
    table.uuid('assessment_version_id').notNullable();
    table.uuid('assessment_version_item_id').notNullable();
    table.integer('position').notNullable();
    table.jsonb('option_order').notNullable();
    table.foreign(['attempt_id', 'assessment_version_id'], 'attempt_items_attempt_scope_fk')
      .references(['id', 'assessment_version_id']).inTable('attempts').onDelete('RESTRICT');
    table.foreign(['assessment_version_item_id', 'assessment_version_id'], 'attempt_items_version_item_scope_fk')
      .references(['id', 'assessment_version_id']).inTable('assessment_version_items').onDelete('RESTRICT');
    table.unique(['attempt_id', 'assessment_version_item_id'], { indexName: 'attempt_items_source_unique' });
    table.unique(['attempt_id', 'position'], { indexName: 'attempt_items_position_unique' });
    table.unique(['id', 'attempt_id'], { indexName: 'attempt_items_answer_scope_unique' });
    table.check('position >= 1', [], 'attempt_items_position_ck');
    table.check("jsonb_typeof(option_order) = 'array' AND jsonb_array_length(option_order) >= 2", [], 'attempt_items_options_ck');
  });

  await knex.schema.createTable('attempt_answers', table => {
    table.uuid('id').primary();
    table.uuid('attempt_id').notNullable();
    table.uuid('attempt_item_id').notNullable();
    table.jsonb('answer').notNullable();
    table.integer('version').notNullable().defaultTo(1);
    table.uuid('operation_key').notNullable();
    table.timestamp('saved_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
    table.foreign(['attempt_item_id', 'attempt_id'], 'attempt_answers_item_scope_fk')
      .references(['id', 'attempt_id']).inTable('attempt_items').onDelete('RESTRICT');
    table.unique(['attempt_id', 'attempt_item_id'], { indexName: 'attempt_answers_item_unique' });
    table.unique(['attempt_id', 'operation_key'], { indexName: 'attempt_answers_operation_unique' });
    table.check('version >= 1', [], 'attempt_answers_version_ck');
    table.check("jsonb_typeof(answer) = 'object' AND jsonb_exists(answer, 'selectedOptionId') AND jsonb_typeof(answer->'selectedOptionId') = 'string'", [], 'attempt_answers_json_ck');
    table.index(['attempt_id', 'saved_at'], 'attempt_answers_saved_idx');
  });

  await knex.raw(`
    CREATE FUNCTION auligma_protect_attempt() RETURNS trigger AS $$
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
      IF OLD.status <> 'in_progress' THEN
        RAISE EXCEPTION 'finished attempts are immutable' USING ERRCODE = '55000';
      END IF;
      IF NEW.status NOT IN ('in_progress','submitted','expired','invalidated') THEN
        RAISE EXCEPTION 'attempt status transition is not allowed' USING ERRCODE = '55000';
      END IF;
      RETURN NEW;
    END;
    $$ LANGUAGE plpgsql;
    CREATE TRIGGER attempts_transition_guard
      BEFORE UPDATE OR DELETE ON attempts
      FOR EACH ROW EXECUTE FUNCTION auligma_protect_attempt();

    CREATE FUNCTION auligma_protect_attempt_item() RETURNS trigger AS $$
    BEGIN
      RAISE EXCEPTION 'attempt item snapshots are immutable' USING ERRCODE = '55000';
    END;
    $$ LANGUAGE plpgsql;
    CREATE TRIGGER attempt_items_immutable
      BEFORE UPDATE OR DELETE ON attempt_items
      FOR EACH ROW EXECUTE FUNCTION auligma_protect_attempt_item();

    CREATE FUNCTION auligma_validate_attempt_answer() RETURNS trigger AS $$
    DECLARE current_status text;
    BEGIN
      IF TG_OP = 'DELETE' THEN
        RAISE EXCEPTION 'attempt answers cannot be deleted' USING ERRCODE = '55000';
      END IF;
      SELECT status INTO current_status FROM attempts WHERE id = NEW.attempt_id FOR UPDATE;
      IF current_status <> 'in_progress' THEN
        RAISE EXCEPTION 'answers can only change during an active attempt' USING ERRCODE = '55000';
      END IF;
      IF TG_OP = 'UPDATE' AND (OLD.attempt_id IS DISTINCT FROM NEW.attempt_id
        OR OLD.attempt_item_id IS DISTINCT FROM NEW.attempt_item_id OR NEW.version <= OLD.version) THEN
        RAISE EXCEPTION 'answer identity or version transition is not allowed' USING ERRCODE = '55000';
      END IF;
      RETURN NEW;
    END;
    $$ LANGUAGE plpgsql;
    CREATE TRIGGER attempt_answers_write_guard
      BEFORE INSERT OR UPDATE OR DELETE ON attempt_answers
      FOR EACH ROW EXECUTE FUNCTION auligma_validate_attempt_answer();
  `);
}

export async function down(knex) {
  await knex.schema.dropTableIfExists('attempt_answers');
  await knex.schema.dropTableIfExists('attempt_items');
  await knex.schema.dropTableIfExists('attempts');
  await knex.raw(`
    DROP FUNCTION IF EXISTS auligma_validate_attempt_answer();
    DROP FUNCTION IF EXISTS auligma_protect_attempt_item();
    DROP FUNCTION IF EXISTS auligma_protect_attempt();
  `);
  await knex.schema.alterTable('assessment_version_items', table => {
    table.dropUnique(['id', 'assessment_version_id'], 'assessment_version_items_attempt_unique');
  });
  await knex.schema.alterTable('enrollments', table => {
    table.dropUnique(['id', 'classroom_id', 'student_user_id'], 'enrollments_attempt_scope_unique');
  });
}
