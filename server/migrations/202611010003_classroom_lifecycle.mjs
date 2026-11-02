export async function up(knex) {
  await knex.schema.alterTable('classrooms', table => {
    table.uuid('archived_by').references('user_id').inTable('teacher_profiles');
    table.timestamp('deleted_at', { useTz: true });
    table.uuid('deleted_by').references('user_id').inTable('teacher_profiles');
  });
  await knex('classrooms').whereNotNull('archived_at').update({ archived_by: knex.ref('teacher_id') });
  await knex.raw(`
    ALTER TABLE classrooms
      ADD CONSTRAINT classrooms_archive_actor_ck
        CHECK ((archived_at IS NULL) = (archived_by IS NULL)),
      ADD CONSTRAINT classrooms_delete_actor_ck
        CHECK ((deleted_at IS NULL) = (deleted_by IS NULL)),
      ADD CONSTRAINT classrooms_delete_requires_archive_ck
        CHECK (deleted_at IS NULL OR archived_at IS NOT NULL)
  `);
  await knex.schema.alterTable('classrooms', table => {
    table.index(['teacher_id','deleted_at','archived_at'], 'classrooms_teacher_lifecycle_idx');
  });
  await knex.schema.alterTable('audit_events', table => {
    table.string('resource_type', 40);
    table.jsonb('details').notNullable().defaultTo('{}');
    table.index(['resource_type','resource_id','created_at'], 'audit_events_resource_idx');
  });
}

export async function down(knex) {
  await knex.schema.alterTable('audit_events', table => {
    table.dropIndex(['resource_type','resource_id','created_at'], 'audit_events_resource_idx');
    table.dropColumn('details');
    table.dropColumn('resource_type');
  });
  await knex.raw(`
    ALTER TABLE classrooms
      DROP CONSTRAINT classrooms_delete_requires_archive_ck,
      DROP CONSTRAINT classrooms_delete_actor_ck,
      DROP CONSTRAINT classrooms_archive_actor_ck
  `);
  await knex.schema.alterTable('classrooms', table => {
    table.dropIndex(['teacher_id','deleted_at','archived_at'], 'classrooms_teacher_lifecycle_idx');
    table.dropColumn('deleted_by');
    table.dropColumn('deleted_at');
    table.dropColumn('archived_by');
  });
}
