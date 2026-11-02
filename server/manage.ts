import { randomUUID } from 'node:crypto';
import { readConfig } from './config.ts';
import { createDatabase } from './db.ts';
const config = readConfig();
if (!config.databaseUrl) throw new Error('Configura DATABASE_URL en .env.');
const db = createDatabase(config.databaseUrl);
try {
  const command = process.argv[2];
  if (command === 'migrate') { await db.migrate.latest(); console.log('Migraciones aplicadas.'); }
  else if (command === 'cleanup') {
    await db.transaction(async tx => { await tx('sessions').where('expires_at','<',new Date()).delete(); await tx('oauth_attempts').where('expires_at','<',new Date()).delete(); });
    console.log('Sesiones y flujos OAuth caducados eliminados.');
  } else if (command === 'authorize' || command === 'revoke') {
    const email = process.env.AUTHORIZATION_EMAIL?.trim().toLowerCase();
    const evidence = process.env.AUTHORIZATION_EVIDENCE?.trim();
    if (!email || !evidence) throw new Error('Define AUTHORIZATION_EMAIL y AUTHORIZATION_EVIDENCE en el entorno privado.');
    await db.transaction(async tx => {
      if (command === 'authorize') {
        await tx('teacher_authorizations').insert({ id: randomUUID(), email, kind: 'institutional', evidence })
          .onConflict('email').merge({ approved: true, revoked_at: null, kind: 'institutional', evidence });
      } else {
        await tx('teacher_authorizations').where({ email }).update({ approved: false, revoked_at: new Date(), evidence });
        const auth = await tx('teacher_authorizations').where({ email }).first();
        const identity = auth?.google_sub ? await tx('external_identities').where({ subject: auth.google_sub }).first() : null;
        if (identity) await tx('sessions').where({ user_id: identity.user_id }).delete();
      }
      await tx('audit_events').insert({ id: randomUUID(), action: `teacher.${command}` });
    });
    console.log('Autorización actualizada; no se imprimen datos personales.');
  } else throw new Error('Comando esperado: migrate, cleanup, authorize o revoke.');
} finally { await db.destroy(); }
