export async function up(knex) {
  await knex.schema.alterTable('classrooms', table => {
    table.unique(['id', 'teacher_id'], { indexName: 'classrooms_id_teacher_unique' });
  });
  await knex.schema.alterTable('question_drafts', table => {
    table.unique(['id', 'classroom_id', 'teacher_id'], { indexName: 'question_drafts_scope_unique' });
  });

  await knex.schema.createTable('question_revisions', table => {
    table.uuid('id').primary();
    table.uuid('question_draft_id').notNullable();
    table.uuid('classroom_id').notNullable();
    table.uuid('teacher_id').notNullable();
    table.integer('revision').notNullable();
    table.jsonb('content').notNullable();
    table.uuid('correct_option_id').notNullable();
    table.jsonb('verification').notNullable();
    table.string('review_status', 24).notNullable();
    table.string('content_hash', 64).notNullable();
    table.uuid('created_by').notNullable().references('user_id').inTable('teacher_profiles');
    table.uuid('approved_by').references('user_id').inTable('teacher_profiles');
    table.timestamp('approved_at', { useTz: true });
    table.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
    table.foreign(['question_draft_id', 'classroom_id', 'teacher_id'], 'question_revisions_draft_scope_fk')
      .references(['id', 'classroom_id', 'teacher_id']).inTable('question_drafts').onDelete('RESTRICT');
    table.unique(['question_draft_id', 'revision'], { indexName: 'question_revisions_number_unique' });
    table.unique(['question_draft_id', 'content_hash'], { indexName: 'question_revisions_content_unique' });
    table.unique(['id', 'classroom_id'], { indexName: 'question_revisions_classroom_unique' });
    table.check('revision >= 1', [], 'question_revisions_revision_ck');
    table.check("review_status IN ('draft','approved','invalid','indeterminate','retired')", [], 'question_revisions_status_ck');
    table.check("content_hash ~ '^[0-9a-f]{64}$'", [], 'question_revisions_hash_ck');
    table.check("jsonb_typeof(content) = 'object' AND jsonb_typeof(verification) = 'object'", [], 'question_revisions_json_ck');
    table.check("(review_status = 'approved') = (approved_by IS NOT NULL AND approved_at IS NOT NULL)", [], 'question_revisions_approval_ck');
    table.index(['classroom_id', 'teacher_id', 'review_status', 'created_at'], 'question_revisions_owner_idx');
  });

  await knex.schema.createTable('assessments', table => {
    table.uuid('id').primary();
    table.uuid('classroom_id').notNullable();
    table.uuid('teacher_id').notNullable();
    table.string('type', 24).notNullable().defaultTo('practice');
    table.string('status', 24).notNullable().defaultTo('draft');
    table.string('title', 200).notNullable();
    table.text('instructions').notNullable().defaultTo('');
    table.integer('version').notNullable().defaultTo(1);
    table.timestamps(true, true);
    table.foreign(['classroom_id', 'teacher_id'], 'assessments_classroom_owner_fk')
      .references(['id', 'teacher_id']).inTable('classrooms').onDelete('RESTRICT');
    table.unique(['id', 'classroom_id'], { indexName: 'assessments_classroom_unique' });
    table.check("type IN ('practice','evaluation')", [], 'assessments_type_ck');
    table.check("status IN ('draft','published','closed','archived')", [], 'assessments_status_ck');
    table.check("length(trim(title)) > 0", [], 'assessments_title_ck');
    table.check('version >= 1', [], 'assessments_version_ck');
    table.index(['classroom_id', 'teacher_id', 'status', 'updated_at'], 'assessments_owner_idx');
  });

  await knex.schema.createTable('assessment_items', table => {
    table.uuid('id').primary();
    table.uuid('assessment_id').notNullable();
    table.uuid('classroom_id').notNullable();
    table.uuid('question_revision_id').notNullable();
    table.integer('position').notNullable();
    table.decimal('points', 8, 2).notNullable();
    table.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
    table.foreign(['assessment_id', 'classroom_id'], 'assessment_items_assessment_scope_fk')
      .references(['id', 'classroom_id']).inTable('assessments').onDelete('CASCADE');
    table.foreign(['question_revision_id', 'classroom_id'], 'assessment_items_question_scope_fk')
      .references(['id', 'classroom_id']).inTable('question_revisions').onDelete('RESTRICT');
    table.unique(['assessment_id', 'question_revision_id'], { indexName: 'assessment_items_question_unique' });
    table.unique(['assessment_id', 'position'], { indexName: 'assessment_items_position_unique' });
    table.check('position >= 1', [], 'assessment_items_position_ck');
    table.check('points > 0 AND points <= 1000', [], 'assessment_items_points_ck');
    table.index(['assessment_id', 'position'], 'assessment_items_order_idx');
  });

  // Preparadas para el snapshot futuro; este hito no expone ninguna operación de publicación.
  await knex.schema.createTable('assessment_versions', table => {
    table.uuid('id').primary();
    table.uuid('assessment_id').notNullable();
    table.uuid('classroom_id').notNullable();
    table.integer('revision').notNullable();
    table.jsonb('settings').notNullable().defaultTo('{}');
    table.decimal('total_points', 10, 2).notNullable();
    table.string('content_hash', 64).notNullable();
    table.uuid('published_by').notNullable().references('user_id').inTable('teacher_profiles');
    table.timestamp('published_at', { useTz: true }).notNullable();
    table.foreign(['assessment_id', 'classroom_id'], 'assessment_versions_assessment_scope_fk')
      .references(['id', 'classroom_id']).inTable('assessments').onDelete('RESTRICT');
    table.unique(['assessment_id', 'revision'], { indexName: 'assessment_versions_number_unique' });
    table.unique(['assessment_id', 'content_hash'], { indexName: 'assessment_versions_content_unique' });
    table.unique(['id', 'classroom_id'], { indexName: 'assessment_versions_classroom_unique' });
    table.check('revision >= 1', [], 'assessment_versions_revision_ck');
    table.check('total_points > 0', [], 'assessment_versions_points_ck');
    table.check("content_hash ~ '^[0-9a-f]{64}$'", [], 'assessment_versions_hash_ck');
  });

  await knex.schema.createTable('assessment_version_items', table => {
    table.uuid('id').primary();
    table.uuid('assessment_version_id').notNullable();
    table.uuid('classroom_id').notNullable();
    table.uuid('question_revision_id').notNullable();
    table.integer('position').notNullable();
    table.decimal('points', 8, 2).notNullable();
    table.jsonb('settings').notNullable().defaultTo('{}');
    table.foreign(['assessment_version_id', 'classroom_id'], 'assessment_version_items_version_scope_fk')
      .references(['id', 'classroom_id']).inTable('assessment_versions').onDelete('CASCADE');
    table.foreign(['question_revision_id', 'classroom_id'], 'assessment_version_items_question_scope_fk')
      .references(['id', 'classroom_id']).inTable('question_revisions').onDelete('RESTRICT');
    table.unique(['assessment_version_id', 'question_revision_id'], { indexName: 'assessment_version_items_question_unique' });
    table.unique(['assessment_version_id', 'position'], { indexName: 'assessment_version_items_position_unique' });
    table.check('position >= 1', [], 'assessment_version_items_position_ck');
    table.check('points > 0 AND points <= 1000', [], 'assessment_version_items_points_ck');
  });

  await knex.raw(`
    CREATE FUNCTION auligma_protect_question_revision() RETURNS trigger AS $$
    BEGIN
      IF TG_OP = 'DELETE' THEN
        IF OLD.review_status = 'approved' THEN
          RAISE EXCEPTION 'approved question revisions are immutable' USING ERRCODE = '55000';
        END IF;
        RETURN OLD;
      END IF;
      IF OLD.review_status = 'approved' THEN
        RAISE EXCEPTION 'approved question revisions are immutable' USING ERRCODE = '55000';
      END IF;
      IF OLD.review_status <> 'draft' OR NEW.review_status <> 'approved'
        OR OLD.question_draft_id IS DISTINCT FROM NEW.question_draft_id
        OR OLD.classroom_id IS DISTINCT FROM NEW.classroom_id
        OR OLD.teacher_id IS DISTINCT FROM NEW.teacher_id
        OR OLD.revision IS DISTINCT FROM NEW.revision
        OR OLD.content IS DISTINCT FROM NEW.content
        OR OLD.correct_option_id IS DISTINCT FROM NEW.correct_option_id
        OR OLD.verification IS DISTINCT FROM NEW.verification
        OR OLD.content_hash IS DISTINCT FROM NEW.content_hash
        OR OLD.created_by IS DISTINCT FROM NEW.created_by
        OR OLD.created_at IS DISTINCT FROM NEW.created_at
        OR NEW.approved_by IS NULL OR NEW.approved_at IS NULL THEN
        RAISE EXCEPTION 'question revision transition is not allowed' USING ERRCODE = '55000';
      END IF;
      RETURN NEW;
    END;
    $$ LANGUAGE plpgsql;
    CREATE TRIGGER question_revisions_immutable
      BEFORE UPDATE OR DELETE ON question_revisions
      FOR EACH ROW EXECUTE FUNCTION auligma_protect_question_revision();

    CREATE FUNCTION auligma_protect_assessment_snapshot() RETURNS trigger AS $$
    BEGIN
      RAISE EXCEPTION 'published assessment snapshots are immutable' USING ERRCODE = '55000';
    END;
    $$ LANGUAGE plpgsql;
    CREATE TRIGGER assessment_versions_immutable
      BEFORE UPDATE OR DELETE ON assessment_versions
      FOR EACH ROW EXECUTE FUNCTION auligma_protect_assessment_snapshot();
    CREATE TRIGGER assessment_version_items_immutable
      BEFORE UPDATE OR DELETE ON assessment_version_items
      FOR EACH ROW EXECUTE FUNCTION auligma_protect_assessment_snapshot();
  `);
}

export async function down(knex) {
  await knex.schema.dropTableIfExists('assessment_version_items');
  await knex.schema.dropTableIfExists('assessment_versions');
  await knex.schema.dropTableIfExists('assessment_items');
  await knex.schema.dropTableIfExists('assessments');
  await knex.schema.dropTableIfExists('question_revisions');
  await knex.raw('DROP FUNCTION IF EXISTS auligma_protect_assessment_snapshot(); DROP FUNCTION IF EXISTS auligma_protect_question_revision();');
  await knex.schema.alterTable('question_drafts', table => table.dropUnique(['id', 'classroom_id', 'teacher_id'], 'question_drafts_scope_unique'));
  await knex.schema.alterTable('classrooms', table => table.dropUnique(['id', 'teacher_id'], 'classrooms_id_teacher_unique'));
}
