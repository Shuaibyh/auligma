import { randomUUID } from 'node:crypto';
import type { Knex } from 'knex';
import type { GoogleIdentity } from './google.ts';
import type { Config } from './config.ts';
import { reconcileInstitutionalEnrollments } from './enrollments.ts';
export class ApiError extends Error {
  constructor(public statusCode: number, public code: string, message: string) { super(message); }
}
export type TeacherAuthorization = { approved: boolean; revoked_at?: Date | null; google_sub?: string | null; kind: 'institutional' | 'pilot' };
export function resolveRole(identity: GoogleIdentity, authorization: TeacherAuthorization | undefined, config: Config) {
  if (authorization && (!authorization.approved || authorization.revoked_at ||
      (authorization.google_sub && authorization.google_sub !== identity.sub) ||
      (authorization.kind === 'pilot' && (!config.pilotEnabled || !config.pilotEmails.includes(identity.email))))) {
    throw new ApiError(403, 'account_not_authorized', 'Cuenta no autorizada.');
  }
  const role = authorization ? 'docente' : identity.hd === 'undc.edu.pe' ? 'estudiante' : null;
  if (!role) throw new ApiError(403, 'account_not_authorized', 'Utiliza una cuenta institucional o docente autorizada.');
  return role;
}
export async function authorizeIdentity(db: Knex, identity: GoogleIdentity, config: Config) {
  return db.transaction(async tx => {
    // Serializa altas simultáneas de la misma identidad sin vincular cuentas por correo.
    await tx.raw('SELECT pg_advisory_xact_lock(hashtext(?))', [identity.sub]);
    let authorization = await tx('teacher_authorizations').where({ google_sub: identity.sub }).first();
    if (!authorization) authorization = await tx('teacher_authorizations').where({ email: identity.email }).first();
    if (!authorization && config.pilotEnabled && config.pilotEmails.includes(identity.email)) {
      [authorization] = await tx('teacher_authorizations').insert({ id: randomUUID(), email: identity.email,
        google_sub: identity.sub, kind: 'pilot', evidence: 'Allowlist privada del entorno de desarrollo' }).returning('*');
    }
    const role = resolveRole(identity, authorization, config);
    if (authorization && !authorization.google_sub) await tx('teacher_authorizations').where({ id: authorization.id }).update({ google_sub: identity.sub });
    const external = await tx('external_identities').where({ provider: 'google', subject: identity.sub }).first();
    let user = external ? await tx('users').where({ id: external.user_id }).first() : undefined;
    if (user && (!user.active || user.role !== role)) throw new ApiError(403, 'account_not_authorized', 'Requiere revisión de autorización.');
    if (!user) {
      if (await tx('users').where({ email: identity.email }).first()) throw new ApiError(403, 'account_not_authorized', 'La identidad requiere revisión.');
      [user] = await tx('users').insert({ id: randomUUID(), email: identity.email, role }).returning('*');
      await tx('external_identities').insert({ id: randomUUID(), user_id: user.id, provider: 'google', subject: identity.sub, hosted_domain: identity.hd });
      await tx(role === 'docente' ? 'teacher_profiles' : 'student_profiles').insert({ user_id: user.id, first_names: identity.firstNames, last_names: identity.lastNames });
    }
    await reconcileInstitutionalEnrollments(tx,user);
    await tx('audit_events').insert({ id: randomUUID(), actor_id: user.id, action: 'identity.authenticated' });
    return user as { id: string; email: string; role: 'docente' | 'estudiante' };
  });
}
