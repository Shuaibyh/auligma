export async function up(knex) {
  await knex.schema.alterTable('assessment_versions', table => {
    table.integer('source_version').notNullable();
    table.timestamp('opens_at', { useTz: true });
    table.timestamp('due_at', { useTz: true });
    table.timestamp('closes_at', { useTz: true });
    table.unique(['assessment_id', 'source_version'], { indexName: 'assessment_versions_source_unique' });
    table.check('source_version >= 1', [], 'assessment_versions_source_version_ck');
    table.check(`
      (opens_at IS NULL OR due_at IS NULL OR opens_at < due_at)
      AND (opens_at IS NULL OR closes_at IS NULL OR opens_at < closes_at)
      AND (due_at IS NULL OR closes_at IS NULL OR due_at <= closes_at)
    `, [], 'assessment_versions_availability_ck');
    table.index(['assessment_id', 'published_at'], 'assessment_versions_publication_idx');
  });
}

export async function down(knex) {
  await knex.schema.alterTable('assessment_versions', table => {
    table.dropIndex(['assessment_id', 'published_at'], 'assessment_versions_publication_idx');
    table.dropUnique(['assessment_id', 'source_version'], 'assessment_versions_source_unique');
    table.dropChecks('assessment_versions_source_version_ck', 'assessment_versions_availability_ck');
    table.dropColumns('source_version', 'opens_at', 'due_at', 'closes_at');
  });
}
