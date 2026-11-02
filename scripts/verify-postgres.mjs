import crypto from 'node:crypto';
import pg from 'pg';

const { Client } = pg;
const connectionString = process.env.DATABASE_URL;
if (!connectionString) throw new Error('Falta DATABASE_URL.');

const expectedTables = [
  'audit_events',
  'academic_materials',
  'academic_nodes',
  'academic_plan_revisions',
  'academic_plans',
  'academic_week_units',
  'classrooms',
  'enrollment_requests',
  'enrollments',
  'external_identities',
  'oauth_attempts',
  'professional_schools',
  'sessions',
  'syllabus_sources',
  'student_profiles',
  'subjects',
  'teacher_authorizations',
  'teacher_profiles',
  'users',
  'planning_proposals'
];

const client = new Client({ connectionString });
const syntheticId = crypto.randomUUID();
let inserted = false;

try {
  await client.connect();
  const identity = await client.query(`
    SELECT current_user AS role, current_database() AS database,
           pg_encoding_to_char(d.encoding) AS encoding,
           pg_catalog.pg_get_userbyid(d.datdba) AS owner
    FROM pg_database d WHERE d.datname = current_database()
  `);
  const role = await client.query(`
    SELECT rolcanlogin, rolsuper, rolcreatedb, rolcreaterole, rolreplication
    FROM pg_roles WHERE rolname = current_user
  `);
  const tables = await client.query(`
    SELECT table_name FROM information_schema.tables
    WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
      AND table_name = ANY($1::text[])
    ORDER BY table_name
  `, [expectedTables]);
  const constraints = await client.query(`
    SELECT c.contype, rel.relname AS table_name, c.conname,
           pg_get_constraintdef(c.oid) AS definition
    FROM pg_constraint c
    JOIN pg_class rel ON rel.oid = c.conrelid
    JOIN pg_namespace n ON n.oid = rel.relnamespace
    WHERE n.nspname = 'public' AND rel.relname = ANY($1::text[])
    ORDER BY rel.relname, c.contype, c.conname
  `, [expectedTables]);
  const indexes = await client.query(`
    SELECT tablename, indexname FROM pg_indexes
    WHERE schemaname = 'public' AND tablename = ANY($1::text[])
    ORDER BY tablename, indexname
  `, [expectedTables]);

  const actualTables = tables.rows.map(({ table_name }) => table_name);
  const missingTables = expectedTables.filter((name) => !actualTables.includes(name));
  if (missingTables.length) throw new Error(`Faltan tablas esperadas: ${missingTables.join(', ')}`);

  await client.query(
    'INSERT INTO audit_events (id, action, resource_id) VALUES ($1, $2, $3)',
    [syntheticId, 'synthetic.persistence.verify', syntheticId]
  );
  inserted = true;
  await client.end();

  const reconnect = new Client({ connectionString });
  await reconnect.connect();
  try {
    const persisted = await reconnect.query(
      'SELECT action FROM audit_events WHERE id = $1 AND resource_id = $1',
      [syntheticId]
    );
    if (persisted.rows[0]?.action !== 'synthetic.persistence.verify') {
      throw new Error('La escritura sintética no persistió tras reconectar.');
    }
    await reconnect.query(
      `DELETE FROM audit_events
       WHERE id = $1 AND resource_id = $1 AND action = 'synthetic.persistence.verify'`,
      [syntheticId]
    );
    inserted = false;
  } finally {
    await reconnect.end();
  }

  const counts = constraints.rows.reduce((result, item) => {
    result[item.contype] = (result[item.contype] ?? 0) + 1;
    return result;
  }, {});
  process.stdout.write(JSON.stringify({
    connection: {
      role: identity.rows[0]?.role,
      database: identity.rows[0]?.database,
      encoding: identity.rows[0]?.encoding,
      owner: identity.rows[0]?.owner
    },
    roleAttributes: role.rows[0],
    tables: actualTables,
    constraints: {
      primaryKeys: counts.p ?? 0,
      foreignKeys: counts.f ?? 0,
      unique: counts.u ?? 0,
      checks: counts.c ?? 0
    },
    indexes: indexes.rowCount,
    persistence: 'verified-after-reconnect',
    syntheticCleanup: 'completed'
  }, null, 2));
} catch (error) {
  if (inserted) {
    const cleanup = new Client({ connectionString });
    try {
      await cleanup.connect();
      await cleanup.query(
        `DELETE FROM audit_events
         WHERE id = $1 AND resource_id = $1 AND action = 'synthetic.persistence.verify'`,
        [syntheticId]
      );
    } finally {
      await cleanup.end().catch(() => {});
    }
  }
  throw error;
} finally {
  await client.end().catch(() => {});
}
