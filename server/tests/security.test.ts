import { test } from 'node:test';
import assert from 'node:assert/strict';
import { generateKeyPair, SignJWT } from 'jose';
import { exchangeGoogle, OAuthDiagnosticError, verifyGoogleToken } from '../google.ts';
import { readConfig } from '../config.ts';
import { createDatabase } from '../db.ts';
import { buildApp } from '../app.ts';
import { resolveRole } from '../identity.ts';

const { privateKey, publicKey } = await generateKeyPair('RS256');
const claims = { sub: 'synthetic-google-sub', email: 'synthetic@undc.edu.pe', email_verified: true, hd: 'undc.edu.pe', nonce: 'synthetic-nonce' };
async function token(overrides: Record<string,unknown> = {}) {
  return new SignJWT({ ...claims, iss: 'https://accounts.google.com', aud: 'synthetic-client', exp: Math.floor(Date.now()/1000)+300, ...overrides })
    .setProtectedHeader({ alg: 'RS256' }).setIssuedAt().sign(privateKey);
}
test('Google simulado: firma y claims válidos', async () => {
  const identity = await verifyGoogleToken(await token(), 'synthetic-client','synthetic-nonce', async () => publicKey);
  assert.equal(identity.sub,claims.sub); assert.equal(identity.hd,'undc.edu.pe');
});
for (const [name, overrides] of Object.entries({
  caducado: { exp: 1 }, audiencia: { aud: 'other-client' }, emisor: { iss: 'https://example.invalid' },
  nonce: { nonce: 'wrong' }, correo_no_verificado: { email_verified: false }, sub_vacio: { sub: '' },
  authorized_party: { azp: 'other-client' }, falta_caducidad: { exp: undefined },
})) test(`Google simulado: rechaza ${name}`, async () => {
  await assert.rejects(verifyGoogleToken(await token(overrides),'synthetic-client','synthetic-nonce',async () => publicKey));
});
test('Google simulado: rechaza firma falsa y token malformado', async () => {
  const other = await generateKeyPair('RS256');
  await assert.rejects(verifyGoogleToken(await token(),'synthetic-client','synthetic-nonce',async () => other.publicKey));
  await assert.rejects(verifyGoogleToken('not-a-token','synthetic-client','synthetic-nonce',async () => publicKey));
});
test('Intercambio Google: clasifica fallos del proveedor sin propagar detalles sensibles', async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => new Response(JSON.stringify({ error: 'invalid_grant', error_description: 'detalle que no debe propagarse' }), {
    status: 400, headers: { 'content-type': 'application/json' },
  });
  try {
    await assert.rejects(exchangeGoogle('synthetic-code','synthetic-verifier','synthetic-nonce',readConfig({
      GOOGLE_CLIENT_ID:'synthetic-client', GOOGLE_CLIENT_SECRET:'synthetic-secret', DATABASE_URL:'synthetic-db',
    })), error => error instanceof OAuthDiagnosticError && error.stage === 'TOKEN_EXCHANGE' &&
      error.diagnosticCode === 'TOKEN_EXCHANGE_FAILED' && error.details.httpStatus === 400 &&
      error.details.providerCode === 'invalid_grant' && !JSON.stringify(error).includes('detalle que no debe propagarse'));
  } finally { globalThis.fetch = originalFetch; }
});
test('Intercambio Google: clasifica un bloqueo de red sin registrar la excepción completa', async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => {
    const failure = new TypeError('fetch failed') as TypeError & { cause: { code: string; privateValue: string } };
    failure.cause = { code: 'EACCES', privateValue: 'no debe propagarse' };
    throw failure;
  };
  try {
    await assert.rejects(exchangeGoogle('synthetic-code','synthetic-verifier','synthetic-nonce',readConfig({
      GOOGLE_CLIENT_ID:'synthetic-client', GOOGLE_CLIENT_SECRET:'synthetic-secret', DATABASE_URL:'synthetic-db',
    })), error => error instanceof OAuthDiagnosticError && error.stage === 'TOKEN_EXCHANGE' &&
      error.diagnosticCode === 'TOKEN_ENDPOINT_UNREACHABLE' && error.details.networkCode === 'EACCES' &&
      !JSON.stringify(error).includes('no debe propagarse'));
  } finally { globalThis.fetch = originalFetch; }
});
test('Configuración: piloto prohibido y HTTPS obligatorio en producción', () => {
  assert.throws(() => readConfig({ NODE_ENV: 'production' }));
  assert.throws(() => readConfig({ NODE_ENV: 'production', FRONTEND_URL: 'https://example.invalid', BACKEND_URL: 'https://example.invalid', ENABLE_PILOT_TEACHERS: 'true' }));
  assert.throws(() => readConfig({ SESSION_HOURS: '0' }));
});
test('Política: hd confiable, Gmail rechazado y autorización docente vinculada/revocable', () => {
  const config = readConfig({ ENABLE_PILOT_TEACHERS:'true', PILOT_TEACHER_EMAILS:'pilot@example.invalid' });
  const identity = {sub:'synthetic-sub',email:'synthetic@undc.edu.pe',firstNames:'',lastNames:''};
  assert.throws(() => resolveRole(identity,undefined,config));
  assert.throws(() => resolveRole({...identity,hd:'other.invalid'},undefined,config));
  assert.throws(() => resolveRole({...identity,email:'synthetic@gmail.com'},undefined,config));
  assert.equal(resolveRole({...identity,hd:'undc.edu.pe'},undefined,config),'estudiante');
  const pilot = {...identity,email:'pilot@example.invalid'};
  const authorization = {approved:true,google_sub:pilot.sub,kind:'pilot' as const};
  assert.equal(resolveRole(pilot,authorization,config),'docente');
  assert.throws(() => resolveRole(pilot,{...authorization,approved:false},config));
  assert.throws(() => resolveRole(pilot,{...authorization,google_sub:'other-sub'},config));
  assert.throws(() => resolveRole(pilot,authorization,readConfig({})));
  assert.throws(() => resolveRole(pilot,authorization,{...config,pilotEmails:[]}));
});
test('Fastify real sin PostgreSQL: anónimo, validación, CORS y configuración', async () => {
  const db = createDatabase(); const app = await buildApp(readConfig({}),db);
  try {
    assert.equal((await app.inject('/api/v1/health')).statusCode,200);
    assert.equal((await app.inject('/api/v1/auth/config')).json().googleConfigured,false);
    for (const url of ['/api/v1/me','/api/v1/classrooms','/api/v1/subjects','/api/v1/professional-schools']) assert.equal((await app.inject(url)).statusCode,401);
    assert.equal((await app.inject({ method:'PATCH',url:'/api/v1/me',payload:{ role:'docente' } })).statusCode,400);
    const denied = await app.inject({ url:'/api/v1/me',headers:{ origin:'https://other.invalid', cookie:'auligma_session=demo-teacher' } });
    assert.equal(denied.statusCode,401);
    assert.notEqual(denied.headers['access-control-allow-origin'],'https://other.invalid');
    assert.equal(denied.headers['cache-control'],'no-store');
    const login = await app.inject('/api/v1/auth/google/start');
    assert.equal(login.statusCode,302); assert.match(login.headers.location!,/google_not_configured/);
    assert.match((await app.inject('/api/v1/auth/google/callback?state=untrusted')).headers.location!,/authentication_failed/);
  } finally { await app.close(); await db.destroy(); }
});
