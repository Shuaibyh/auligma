import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import pg from 'pg';

const { Client } = pg;
const root = process.cwd();
const adminPassword = process.env.AULIGMA_PG_ADMIN_PASSWORD;
const existingPassword = process.env.AULIGMA_EXISTING_APP_PASSWORD;
if (!adminPassword) {
  process.stdout.write(JSON.stringify({
    ok: false,
    stage: 'input',
    code: 'AULIGMA_ADMIN_PASSWORD_REQUIRED',
    description: 'Falta la contraseña administrativa en el entorno privado.'
  }));
  process.exit(1);
}

function safeDescription(error) {
  const descriptions = {
    '28P01': 'PostgreSQL rechazó la autenticación. Verifica la contraseña del usuario indicada para esta etapa.',
    '42501': 'PostgreSQL rechazó la operación por permisos insuficientes.',
    '42601': 'PostgreSQL rechazó una sentencia SQL del aprovisionador.',
    '3D000': 'La base de datos solicitada no existe.',
    ECONNREFUSED: 'No se pudo conectar con PostgreSQL en 127.0.0.1:5432.',
    ETIMEDOUT: 'La conexión con PostgreSQL agotó el tiempo de espera.'
  };
  return descriptions[error?.code] ?? 'PostgreSQL no pudo completar la etapa indicada. No se modificó la autenticación del servidor.';
}

const admin = new Client({ host: '127.0.0.1', port: 5432, database: 'postgres', user: 'postgres', password: adminPassword });
let generatedPassword;
let stage = 'admin-connect';
try {
  await admin.connect();
  stage = 'inspect-existing-resources';
  const roleResult = await admin.query(`
    SELECT rolname, rolsuper, rolcreatedb, rolcreaterole, rolreplication, rolcanlogin
    FROM pg_roles WHERE rolname = 'auligma_app'
  `);
  const databaseResult = await admin.query(`
    SELECT d.datname, pg_catalog.pg_get_userbyid(d.datdba) AS owner,
           pg_encoding_to_char(d.encoding) AS encoding
    FROM pg_database d WHERE d.datname IN ('auligma_dev', 'auligma_test')
  `);
  const role = roleResult.rows[0];
  const database = databaseResult.rows.find(({ datname }) => datname === 'auligma_dev');
  const testDatabase = databaseResult.rows.find(({ datname }) => datname === 'auligma_test');
  for (const candidate of [database, testDatabase].filter(Boolean)) {
    if (candidate.owner !== 'auligma_app') throw new Error(`${candidate.datname} existe con otro propietario; se preservó sin cambios.`);
    if (candidate.encoding !== 'UTF8') throw new Error(`${candidate.datname} existe con otra codificación; se preservó sin cambios.`);
  }
  if (role && (!role.rolcanlogin || role.rolsuper || role.rolcreatedb || role.rolcreaterole || role.rolreplication)) {
    throw new Error('auligma_app existe con atributos incompatibles; se preservó sin cambios.');
  }
  if (role && !existingPassword) {
    process.exitCode = 12;
    process.stderr.write('AULIGMA_EXISTING_ROLE\n');
  } else {
    let appPassword = existingPassword;
    if (!role) {
      generatedPassword = crypto.randomBytes(32).toString('base64url');
      appPassword = generatedPassword;
      stage = 'create-application-role';
      await admin.query('BEGIN');
      try {
        await admin.query('CREATE ROLE auligma_app LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION');
        await admin.query(`SELECT set_config('auligma.provision_password', $1, true)`, [appPassword]);
        await admin.query(`
          DO $provision$
          BEGIN
            EXECUTE format(
              'ALTER ROLE auligma_app PASSWORD %L',
              current_setting('auligma.provision_password')
            );
          END
          $provision$;
        `);
        await admin.query('COMMIT');
      } catch (error) {
        await admin.query('ROLLBACK').catch(() => {});
        throw error;
      }
    }
    stage = 'create-development-database';
    if (!database) await admin.query(`CREATE DATABASE auligma_dev OWNER auligma_app ENCODING 'UTF8' TEMPLATE template0`);
    stage = 'create-test-database';
    if (!testDatabase) await admin.query(`CREATE DATABASE auligma_test OWNER auligma_app ENCODING 'UTF8' TEMPLATE template0`);

    stage = 'verify-application-connection';
    const app = new Client({ host: '127.0.0.1', port: 5432, database: 'auligma_dev', user: 'auligma_app', password: appPassword });
    try {
      await app.connect();
      const identity = await app.query('SELECT current_user, current_database(), pg_encoding_to_char(encoding) AS encoding FROM pg_database WHERE datname = current_database()');
      if (identity.rows[0]?.current_user !== 'auligma_app' || identity.rows[0]?.current_database !== 'auligma_dev') throw new Error('La identidad de conexión no coincide.');
    } finally { await app.end().catch(() => {}); }

    const envPath = path.join(root, '.env');
    const base = fs.existsSync(envPath) ? fs.readFileSync(envPath, 'utf8') : fs.readFileSync(path.join(root, '.env.example'), 'utf8');
    const databaseUrl = `postgresql://auligma_app:${encodeURIComponent(appPassword)}@127.0.0.1:5432/auligma_dev`;
    const testDatabaseUrl = `postgresql://auligma_app:${encodeURIComponent(appPassword)}@127.0.0.1:5432/auligma_test`;
    let updated = /(^|\r?\n)DATABASE_URL=.*(?=\r?\n|$)/.test(base)
      ? base.replace(/(^|\r?\n)DATABASE_URL=.*(?=\r?\n|$)/, `$1DATABASE_URL=${databaseUrl}`)
      : `${base.trimEnd()}\nDATABASE_URL=${databaseUrl}\n`;
    updated = /(^|\r?\n)DATABASE_TEST_URL=.*(?=\r?\n|$)/.test(updated)
      ? updated.replace(/(^|\r?\n)DATABASE_TEST_URL=.*(?=\r?\n|$)/, `$1DATABASE_TEST_URL=${testDatabaseUrl}`)
      : `${updated.trimEnd()}\nDATABASE_TEST_URL=${testDatabaseUrl}\n`;
    const temporary = `${envPath}.tmp`;
    fs.writeFileSync(temporary, updated, { encoding: 'utf8', mode: 0o600 });
    fs.renameSync(temporary, envPath);
    process.stdout.write(JSON.stringify({
      ok: true,
      role: role ? 'reused' : 'created',
      database: database ? 'reused' : 'created',
      testDatabase: testDatabase ? 'reused' : 'created',
      connection: 'verified',
      env: 'updated'
    }));
  }
} catch (error) {
  process.exitCode = 1;
  process.stdout.write(JSON.stringify({
    ok: false,
    stage,
    code: error?.code ?? 'AULIGMA_PROVISION_ERROR',
    description: safeDescription(error)
  }));
} finally {
  await admin.end().catch(() => {});
  delete process.env.AULIGMA_PG_ADMIN_PASSWORD;
  delete process.env.AULIGMA_EXISTING_APP_PASSWORD;
}
