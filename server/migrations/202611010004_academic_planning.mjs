export async function up(knex) {
  await knex.schema.createTable('academic_plans', table => {
    table.uuid('id').primary();
    table.uuid('classroom_id').notNullable().unique().references('id').inTable('classrooms').onDelete('RESTRICT');
    table.string('title',160).notNullable();
    table.integer('week_count').notNullable().defaultTo(16);
    table.integer('revision').notNullable().defaultTo(1);
    table.uuid('created_by').notNullable().references('user_id').inTable('teacher_profiles');
    table.uuid('updated_by').notNullable().references('user_id').inTable('teacher_profiles');
    table.timestamps(true,true);
    table.check('week_count >= 1 AND week_count <= 60',[],'academic_plans_week_count_ck');
    table.check('revision >= 1',[],'academic_plans_revision_ck');
  });
  await knex.schema.createTable('academic_nodes', table => {
    table.uuid('id').primary();
    table.uuid('plan_id').notNullable().references('id').inTable('academic_plans').onDelete('CASCADE');
    table.uuid('classroom_id').notNullable().references('id').inTable('classrooms').onDelete('RESTRICT');
    table.uuid('parent_id').references('id').inTable('academic_nodes').onDelete('RESTRICT');
    table.enu('type',['unit','week','module','topic','subtopic','milestone'],{useNative:false,enumName:'academic_node_type'}).notNullable();
    table.string('title',200).notNullable();
    table.text('description').notNullable().defaultTo('');
    table.integer('position').notNullable().defaultTo(1000);
    table.enu('status',['draft','published'],{useNative:false,enumName:'academic_node_status'}).notNullable().defaultTo('draft');
    table.timestamp('published_at',{useTz:true});
    table.timestamp('archived_at',{useTz:true});
    table.date('starts_on');
    table.date('ends_on');
    table.uuid('source_node_id').references('id').inTable('academic_nodes').onDelete('SET NULL');
    table.uuid('created_by').notNullable().references('user_id').inTable('teacher_profiles');
    table.uuid('updated_by').notNullable().references('user_id').inTable('teacher_profiles');
    table.timestamps(true,true);
    table.check('position >= 0',[],'academic_nodes_position_ck');
    table.check("(status = 'draft' AND published_at IS NULL) OR (status = 'published' AND published_at IS NOT NULL)",[],'academic_nodes_publication_ck');
    table.check('starts_on IS NULL OR ends_on IS NULL OR starts_on <= ends_on',[],'academic_nodes_dates_ck');
    table.index(['plan_id','parent_id','position'],'academic_nodes_tree_idx');
    table.index(['classroom_id','status','archived_at'],'academic_nodes_visibility_idx');
  });
  await knex.schema.createTable('academic_week_units', table => {
    table.uuid('week_id').notNullable().references('id').inTable('academic_nodes').onDelete('CASCADE');
    table.uuid('unit_id').notNullable().references('id').inTable('academic_nodes').onDelete('CASCADE');
    table.primary(['week_id','unit_id']);
  });
  await knex.schema.createTable('academic_materials', table => {
    table.uuid('id').primary();
    table.uuid('classroom_id').notNullable().references('id').inTable('classrooms').onDelete('RESTRICT');
    table.uuid('node_id').notNullable().references('id').inTable('academic_nodes').onDelete('RESTRICT');
    table.enu('kind',['pdf','document','link','note'],{useNative:false,enumName:'academic_material_kind'}).notNullable();
    table.string('title',200).notNullable();
    table.text('description').notNullable().defaultTo('');
    table.string('mime_type',120);
    table.bigInteger('size_bytes');
    table.string('storage_key',120).unique();
    table.string('external_url',2048);
    table.text('text_content');
    table.string('sha256',64);
    table.enu('status',['draft','published'],{useNative:false,enumName:'academic_material_status'}).notNullable().defaultTo('draft');
    table.timestamp('published_at',{useTz:true});
    table.timestamp('deleted_at',{useTz:true});
    table.uuid('created_by').notNullable().references('user_id').inTable('teacher_profiles');
    table.uuid('updated_by').notNullable().references('user_id').inTable('teacher_profiles');
    table.timestamps(true,true);
    table.check("(kind IN ('pdf','document') AND storage_key IS NOT NULL AND external_url IS NULL AND text_content IS NULL) OR (kind = 'link' AND storage_key IS NULL AND external_url IS NOT NULL AND text_content IS NULL) OR (kind = 'note' AND storage_key IS NULL AND external_url IS NULL AND text_content IS NOT NULL)",[],'academic_materials_payload_ck');
    table.check("(status = 'draft' AND published_at IS NULL) OR (status = 'published' AND published_at IS NOT NULL)",[],'academic_materials_publication_ck');
    table.check('size_bytes IS NULL OR (size_bytes > 0 AND size_bytes <= 10485760)',[],'academic_materials_size_ck');
    table.index(['classroom_id','node_id','status','deleted_at'],'academic_materials_visibility_idx');
  });
  await knex.schema.createTable('syllabus_sources', table => {
    table.uuid('id').primary();
    table.uuid('plan_id').notNullable().references('id').inTable('academic_plans').onDelete('CASCADE');
    table.uuid('classroom_id').notNullable().references('id').inTable('classrooms').onDelete('RESTRICT');
    table.string('original_name',240).notNullable();
    table.string('storage_key',120).notNullable().unique();
    table.string('mime_type',120).notNullable();
    table.bigInteger('size_bytes').notNullable();
    table.string('sha256',64).notNullable();
    table.enu('extraction_status',['pending','extracted','no_text','failed'],{useNative:false,enumName:'syllabus_extraction_status'}).notNullable().defaultTo('pending');
    table.text('extracted_text');
    table.string('error_code',80);
    table.boolean('external_processing_accepted').notNullable().defaultTo(false);
    table.uuid('created_by').notNullable().references('user_id').inTable('teacher_profiles');
    table.timestamps(true,true);
    table.check('size_bytes > 0 AND size_bytes <= 10485760',[],'syllabus_sources_size_ck');
    table.index(['classroom_id','created_at'],'syllabus_sources_classroom_idx');
  });
  await knex.schema.createTable('planning_proposals', table => {
    table.uuid('id').primary();
    table.uuid('source_id').notNullable().references('id').inTable('syllabus_sources').onDelete('CASCADE');
    table.uuid('classroom_id').notNullable().references('id').inTable('classrooms').onDelete('RESTRICT');
    table.enu('provider',['manual_extraction','configured_ai'],{useNative:false,enumName:'planning_proposal_provider'}).notNullable();
    table.string('model',120);
    table.enu('status',['pending','ready','failed','approved','discarded','applied'],{useNative:false,enumName:'planning_proposal_status'}).notNullable().defaultTo('pending');
    table.jsonb('payload').notNullable().defaultTo('{}');
    table.string('error_code',80);
    table.uuid('reviewed_by').references('user_id').inTable('teacher_profiles');
    table.timestamp('reviewed_at',{useTz:true});
    table.timestamp('applied_at',{useTz:true});
    table.timestamps(true,true);
    table.index(['classroom_id','status','created_at'],'planning_proposals_classroom_idx');
  });
  await knex.schema.createTable('academic_plan_revisions', table => {
    table.uuid('id').primary();
    table.uuid('plan_id').notNullable().references('id').inTable('academic_plans').onDelete('CASCADE');
    table.integer('revision').notNullable();
    table.string('action',60).notNullable();
    table.jsonb('snapshot').notNullable();
    table.uuid('actor_id').notNullable().references('id').inTable('users');
    table.timestamp('created_at',{useTz:true}).notNullable().defaultTo(knex.fn.now());
    table.unique(['plan_id','revision']);
  });
}

export async function down(knex) {
  for (const name of ['academic_plan_revisions','planning_proposals','syllabus_sources','academic_materials','academic_week_units','academic_nodes','academic_plans']) await knex.schema.dropTableIfExists(name);
}
