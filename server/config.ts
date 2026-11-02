export function readConfig(env: NodeJS.ProcessEnv = process.env) {
  const production = env.NODE_ENV === 'production';
  const frontendUrl = env.FRONTEND_URL || 'http://127.0.0.1:5173';
  const backendUrl = env.BACKEND_URL || 'http://127.0.0.1:3001';
  for (const value of [frontendUrl, backendUrl]) {
    const url = new URL(value);
    if (url.origin !== value || (production && url.protocol !== 'https:')) throw new Error('Configura orígenes válidos; producción requiere HTTPS.');
  }
  if (production && env.ENABLE_PILOT_TEACHERS === 'true') throw new Error('La excepción docente piloto está prohibida en producción.');
  const sessionHours = Number(env.SESSION_HOURS || 8);
  if (!Number.isInteger(sessionHours) || sessionHours < 1 || sessionHours > 24) throw new Error('SESSION_HOURS debe estar entre 1 y 24.');
  return {
    production, frontendUrl, backendUrl, sessionHours,
    port: Number(new URL(backendUrl).port || (production ? 443 : 3001)),
    databaseUrl: env.DATABASE_URL,
    clientId: env.GOOGLE_CLIENT_ID || '', clientSecret: env.GOOGLE_CLIENT_SECRET || '',
    callbackUrl: `${backendUrl}/api/v1/auth/google/callback`,
    pilotEnabled: !production && env.ENABLE_PILOT_TEACHERS === 'true',
    pilotEmails: (env.PILOT_TEACHER_EMAILS || '').split(',').map(value => value.trim().toLowerCase()).filter(Boolean),
  };
}
export type Config = ReturnType<typeof readConfig>;
