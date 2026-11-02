import { readConfig } from './config.ts';
import { createDatabase } from './db.ts';
import { buildApp } from './app.ts';
const config = readConfig();
const db = createDatabase(config.databaseUrl);
const app = await buildApp(config, db);
for (const signal of ['SIGINT','SIGTERM']) process.once(signal, async () => { await app.close(); await db.destroy(); });
await app.listen({ port: config.port, host: '127.0.0.1' });
