import { createRemoteJWKSet, jwtVerify, type JWTVerifyGetKey } from 'jose';
import type { Config } from './config.ts';
const keys = createRemoteJWKSet(new URL('https://www.googleapis.com/oauth2/v3/certs'));
export type GoogleIdentity = { sub: string; email: string; hd?: string; firstNames: string; lastNames: string };
export type OAuthDiagnosticDetails = { httpStatus?: number; providerCode?: string; libraryCode?: string; networkCode?: string };
export class OAuthDiagnosticError extends Error {
  constructor(public stage: string, public diagnosticCode: string, public details: OAuthDiagnosticDetails = {}) {
    super(diagnosticCode);
    this.name = 'OAuthDiagnosticError';
  }
}
function safeErrorCode(error: unknown) {
  if (!error || typeof error !== 'object') return undefined;
  const direct = 'code' in error ? error.code : undefined;
  const cause = 'cause' in error && error.cause && typeof error.cause === 'object' && 'code' in error.cause ? error.cause.code : undefined;
  const value = typeof direct === 'string' ? direct : typeof cause === 'string' ? cause : undefined;
  return value && /^[A-Z0-9_]{2,80}$/.test(value) ? value : undefined;
}
export async function verifyGoogleToken(token: string, audience: string, nonce: string, key: JWTVerifyGetKey = keys): Promise<GoogleIdentity> {
  let payload;
  try {
    ({ payload } = await jwtVerify(token, key, {
      issuer: ['https://accounts.google.com', 'accounts.google.com'], audience,
      algorithms: ['RS256'], requiredClaims: ['sub','exp','iat','email','email_verified','nonce'],
    }));
  } catch (error) {
    throw new OAuthDiagnosticError('ID_TOKEN_VERIFY', 'ID_TOKEN_INVALID', { libraryCode: safeErrorCode(error) });
  }
  if (payload.nonce !== nonce || payload.email_verified !== true || typeof payload.email !== 'string' || !payload.sub ||
      (payload.azp !== undefined && payload.azp !== audience)) {
    throw new OAuthDiagnosticError('ID_TOKEN_VERIFY', 'ID_TOKEN_CLAIMS_INVALID');
  }
  return { sub: payload.sub, email: payload.email.toLowerCase(), hd: typeof payload.hd === 'string' ? payload.hd : undefined,
    firstNames: typeof payload.given_name === 'string' ? payload.given_name.slice(0,80) : '',
    lastNames: typeof payload.family_name === 'string' ? payload.family_name.slice(0,80) : '' };
}
export async function exchangeGoogle(code: string, verifier: string, nonce: string, config: Config) {
  let response: Response;
  try {
    response = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST', signal: AbortSignal.timeout(10000),
      body: new URLSearchParams({ code, code_verifier: verifier, client_id: config.clientId,
        client_secret: config.clientSecret, redirect_uri: config.callbackUrl, grant_type: 'authorization_code' }),
    });
  } catch (error) {
    throw new OAuthDiagnosticError('TOKEN_EXCHANGE', 'TOKEN_ENDPOINT_UNREACHABLE', { networkCode: safeErrorCode(error) });
  }
  const result = await response.json().catch(() => ({})) as { id_token?: string; error?: string };
  if (!response.ok) {
    const providerCode = typeof result.error === 'string' && /^[a-z0-9_]{2,80}$/.test(result.error) ? result.error : 'unclassified';
    throw new OAuthDiagnosticError('TOKEN_EXCHANGE', 'TOKEN_EXCHANGE_FAILED', { httpStatus: response.status, providerCode });
  }
  if (!result.id_token) throw new OAuthDiagnosticError('TOKEN_EXCHANGE', 'TOKEN_RESPONSE_INVALID', { httpStatus: response.status });
  return verifyGoogleToken(result.id_token, config.clientId, nonce);
}
