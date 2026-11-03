export async function up(knex) {
  await knex.schema.createTable('question_drafts', table => {
    table.uuid('id').primary();
    table.uuid('teacher_id').notNullable().references('user_id').inTable('teacher_profiles');
    table.uuid('classroom_id').notNullable().references('id').inTable('classrooms');
    table.uuid('node_id').references('id').inTable('academic_nodes');
    table.uuid('material_id').references('id').inTable('academic_materials');
    table.jsonb('content').notNullable();
    table.jsonb('verification');
    table.string('review_status', 32).notNullable().defaultTo('draft');
    table.integer('version').notNullable().defaultTo(1);
    table.timestamp('discarded_at', { useTz: true });
    table.timestamps(true, true);
    table.check('version >= 1');
    table.check("review_status IN ('draft','reviewed','invalid','indeterminate')");
    table.index(['classroom_id', 'teacher_id', 'node_id']);
  });
}

// La reversión requiere una decisión explícita de conservación de borradores.
export async function down() {
  throw new Error('Reversión automática desactivada: preservar question_drafts.');
}
