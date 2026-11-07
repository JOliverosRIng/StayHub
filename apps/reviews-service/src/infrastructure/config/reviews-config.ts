import { readFileSync } from 'node:fs';

export interface JwtVerificationConfig { publicKeys: Readonly<Record<string, string>>; issuer: string; audience: string; scope?: string; }
export interface ReviewsConfig {
  nodeEnv: string; port: 3007; databaseUrl: string; userJwt: JwtVerificationConfig; gatewayJwt: JwtVerificationConfig;
  bookingsBaseUrl: string; bookingsTimeoutMs: number; bookingsServiceTokenFile?: string; bookingsServiceToken?: string;
  shutdownGraceMs: number; logLevel: string; otlpEndpoint: string;
}

function required(name: string, value?: string): string { if (!value?.trim()) throw new Error(`Missing required configuration: ${name}`); return value.trim(); }
function secret(env: NodeJS.ProcessEnv, name: string): string { const file = env[`${name}_FILE`]?.trim(); return required(name, file ? readFileSync(file, 'utf8') : env[name]); }
function positiveInteger(name: string, raw: string | undefined, fallback?: number): number { const value = raw === undefined && fallback !== undefined ? fallback : Number(raw); if (!Number.isSafeInteger(value) || value <= 0) throw new Error(`${name} must be a positive integer`); return value; }
function httpUrl(name: string, raw?: string): string { const value = required(name, raw); const parsed = new URL(value); if (!['http:', 'https:'].includes(parsed.protocol)) throw new Error(`${name} must use HTTP(S)`); return value.replace(/\/$/u, ''); }
function databaseUrl(env: NodeJS.ProcessEnv): string { const value = secret(env, 'REVIEWS_DATABASE_URL'); const parsed = new URL(value); if (!['postgres:', 'postgresql:'].includes(parsed.protocol)) throw new Error('REVIEWS_DATABASE_URL must use PostgreSQL'); return value; }
function keys(name: string, raw?: string): Readonly<Record<string, string>> {
  let parsed: unknown; try { parsed = JSON.parse(required(name, raw)); } catch { throw new Error(`${name} is invalid JSON`); }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed) || Object.entries(parsed as Record<string, unknown>).some(([key, value]) => !key || typeof value !== 'string' || !value.trim())) throw new Error(`${name} is invalid`);
  return Object.freeze(parsed as Record<string, string>);
}

export function loadReviewsConfig(env: NodeJS.ProcessEnv = process.env): ReviewsConfig {
  const port = positiveInteger('REVIEWS_PORT', env.REVIEWS_PORT, 3007); if (port !== 3007) throw new Error('REVIEWS_PORT must be 3007');
  const tokenFile = env.REVIEWS_BOOKINGS_SERVICE_TOKEN_FILE?.trim(); const token = env.REVIEWS_BOOKINGS_SERVICE_TOKEN?.trim();
  if (!tokenFile && !token) throw new Error('Missing required configuration: REVIEWS_BOOKINGS_SERVICE_TOKEN_FILE');
  return Object.freeze({
    nodeEnv: env.NODE_ENV?.trim() || 'development', port: 3007, databaseUrl: databaseUrl(env),
    userJwt: Object.freeze({ publicKeys: keys('REVIEWS_USER_JWT_PUBLIC_KEYS_JSON', env.REVIEWS_USER_JWT_PUBLIC_KEYS_JSON), issuer: required('REVIEWS_USER_JWT_ISSUER', env.REVIEWS_USER_JWT_ISSUER), audience: required('REVIEWS_USER_JWT_AUDIENCE', env.REVIEWS_USER_JWT_AUDIENCE) }),
    gatewayJwt: Object.freeze({ publicKeys: keys('REVIEWS_GATEWAY_JWT_PUBLIC_KEYS_JSON', env.REVIEWS_GATEWAY_JWT_PUBLIC_KEYS_JSON), issuer: required('REVIEWS_GATEWAY_JWT_ISSUER', env.REVIEWS_GATEWAY_JWT_ISSUER), audience: required('REVIEWS_GATEWAY_JWT_AUDIENCE', env.REVIEWS_GATEWAY_JWT_AUDIENCE), scope: required('REVIEWS_GATEWAY_JWT_SCOPE', env.REVIEWS_GATEWAY_JWT_SCOPE) }),
    bookingsBaseUrl: httpUrl('REVIEWS_BOOKINGS_BASE_URL', env.REVIEWS_BOOKINGS_BASE_URL), bookingsTimeoutMs: positiveInteger('REVIEWS_BOOKINGS_TIMEOUT_MS', env.REVIEWS_BOOKINGS_TIMEOUT_MS, 1500),
    ...(tokenFile ? { bookingsServiceTokenFile: tokenFile } : {}), ...(token ? { bookingsServiceToken: token } : {}),
    shutdownGraceMs: positiveInteger('REVIEWS_SHUTDOWN_GRACE_MS', env.REVIEWS_SHUTDOWN_GRACE_MS, 10000), logLevel: env.REVIEWS_LOG_LEVEL?.trim() || 'info',
    otlpEndpoint: httpUrl('OTEL_EXPORTER_OTLP_ENDPOINT', env.OTEL_EXPORTER_OTLP_ENDPOINT ?? 'http://otel-collector:4318'),
  });
}
