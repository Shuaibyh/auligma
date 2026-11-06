import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import type { Knex } from 'knex';
import { buildApp } from '../app.ts';
import { readConfig } from '../config.ts';
import { OAuthDiagnosticError } from '../google.ts';

test('OAuth con almacén simulado: PKCE, cookie, correlación, consumo único y límite', async () => {
  type Attempt = {state_hash:string;browser_hash:string;nonce:string;verifier:string;expires_at:Date};
  const attempts: Attempt[] = [];
  // Doble limitado a transacciones OAuth. No representa ni valida PostgreSQL.
  const db = ((table: string) => {
    assert.equal(table,'oauth_attempts');
    const filters: ((row:Attempt) => boolean)[] = [];
    const query = {
      where(field: Record<string,string> | string, operator?: string, value?: Date) {
        if (typeof field === 'string') filters.push(row => operator === '<' ? row.expires_at < value! : row.expires_at > value!);
        else filters.push(row => Object.entries(field).every(([key,expected]) => row[key as keyof Attempt] === expected));
        return query;
      },
      insert(row: Attempt) { attempts.push(row); return Promise.resolve(); },
      delete() {
        const removed = attempts.filter(row => filters.every(filter => filter(row)));
        for (const row of removed) attempts.splice(attempts.indexOf(row),1);
        return { returning: async () => removed };
      },
    };
    return query;
  }) as unknown as Knex;
  const config = readConfig({DATABASE_URL:'synthetic-only',GOOGLE_CLIENT_ID:'synthetic-client',GOOGLE_CLIENT_SECRET:'synthetic-secret'});
  let exchanges = 0;
  const app = await buildApp(config,db,async (_code,verifier,nonce) => {
    exchanges++;
    assert.equal(verifier.length,43); assert.equal(nonce.length,43);
    throw new OAuthDiagnosticError('TOKEN_EXCHANGE','TOKEN_ENDPOINT_UNREACHABLE',{networkCode:'EACCES'});
  });
  try {
    const start = await app.inject('/api/v1/auth/google/start');
    assert.equal(start.statusCode,302);
    const authorization = new URL(start.headers.location!);
    assert.equal(authorization.origin,'https://accounts.google.com');
    assert.equal(authorization.searchParams.get('scope'),'openid email profile');
    assert.equal(authorization.searchParams.get('code_challenge_method'),'S256');
    assert.equal(authorization.searchParams.get('code_challenge'),createHash('sha256').update(attempts[0].verifier).digest('base64url'));
    assert.match(String(start.headers['set-cookie']),/HttpOnly/); assert.match(String(start.headers['set-cookie']),/SameSite=Lax/);
    const state = authorization.searchParams.get('state');
    const cookie = String(start.headers['set-cookie']).split(';')[0];
    await app.inject(`/api/v1/auth/google/callback?state=${state}&code=synthetic`);
    assert.equal(exchanges,0); assert.equal(attempts.length,1);
    const callback = await app.inject({url:`/api/v1/auth/google/callback?state=${state}&code=synthetic`,headers:{cookie}});
    assert.match(callback.headers.location!,/google_unreachable/);
    assert.match(callback.headers.location!,/reference=[0-9a-f-]{36}/);
    assert.doesNotMatch(callback.headers.location!,/Proveedor|synthetic-secret|synthetic-code/);
    assert.equal(exchanges,1); assert.equal(attempts.length,0);
    await app.inject({url:`/api/v1/auth/google/callback?state=${state}&code=synthetic`,headers:{cookie}});
    assert.equal(exchanges,1);
    const cancelStart = await app.inject('/api/v1/auth/google/start');
    const cancelState = new URL(cancelStart.headers.location!).searchParams.get('state');
    const cancel = await app.inject({url:`/api/v1/auth/google/callback?state=${cancelState}&error=access_denied`,headers:{cookie:String(cancelStart.headers['set-cookie']).split(';')[0]}});
    assert.match(cancel.headers.location!,/cancelled/); assert.equal(exchanges,1);
    let limited = false;
    for(let index=0;index<11;index++) limited ||= (await app.inject('/api/v1/auth/google/start')).statusCode === 429;
    assert.equal(limited,true);
  } finally { await app.close(); }
});
