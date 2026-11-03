import { createDatabase } from '../db.ts';

/** Bloquea migraciones y fixtures fuera de la base local aislada. */
export async function verifiedTestDatabase(connection: string | undefined) {
  if (!connection) throw new Error('Falta DATABASE_TEST_URL.');
  const target = new URL(connection);
  if (!['localhost', '127.0.0.1', '[::1]'].includes(target.hostname)
    || decodeURIComponent(target.pathname) !== '/auligma_test') {
    throw new Error('Las pruebas requieren exclusivamente PostgreSQL local: auligma_test.');
  }
  const db = createDatabase(connection);
  try {
    const result = await db.raw('SELECT current_database() AS name');
    if (result.rows[0]?.name !== 'auligma_test') throw new Error('Identidad de base de pruebas incorrecta.');
    return db;
  } catch (error) {
    await db.destroy();
    throw error;
  }
}
