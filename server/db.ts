import knex from 'knex';
export function createDatabase(connection?: string) {
  return knex({ client: 'pg', connection, pool: { min: 0, max: 10 }, acquireConnectionTimeout: 5000,
    compileSqlOnError: false, migrations: { directory: './server/migrations', loadExtensions: ['.mjs'] } });
}
