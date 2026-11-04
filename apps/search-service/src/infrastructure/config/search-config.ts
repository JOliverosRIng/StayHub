import { readFileSync } from 'node:fs';

export interface SearchConfig {
  readonly port: number; readonly databaseUrl: string; readonly redisUrl: string; readonly rabbitmqUrl: string;
  readonly jwtPublicKeys: Readonly<Record<string, string>>; readonly jwtIssuer: string; readonly jwtAudience: string; readonly jwtScope: string;
  readonly cacheTtlSeconds: number; readonly cacheJitterSeconds: number; readonly pageSizeMax: number; readonly suggestLimitMax: number;
  readonly similarityThreshold: number; readonly dependencyTimeoutMs: number; readonly rabbitmqPrefetch: number; readonly shutdownGraceMs: number;
  readonly otelServiceName: string;
}

function required(name: string, value: string | undefined): string {
  if (!value?.trim()) throw new Error(`Missing required configuration: ${name}`);
  return value.trim();
}
function positiveInteger(name: string, raw: string | undefined, fallback: number): number {
  const value = raw === undefined ? fallback : Number(raw);
  if (!Number.isSafeInteger(value) || value <= 0) throw new Error(`${name} must be a positive integer`);
  return value;
}
function readSecret(fileName: string | undefined, directValue: string | undefined, name: string): string {
  if (fileName?.trim()) return required(name, readFileSync(fileName.trim(), 'utf8'));
  return required(name, directValue);
}
function publicKeys(raw: string): Readonly<Record<string, string>> {
  const parsed: unknown = JSON.parse(raw);
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('SEARCH_SERVICE_JWT_PUBLIC_KEYS_JSON must be an object');
  const entries = Object.entries(parsed as Record<string, unknown>);
  if (entries.length === 0 || entries.some(([kid, pem]) => !kid || typeof pem !== 'string' || !pem.includes('PUBLIC KEY'))) throw new Error('SEARCH_SERVICE_JWT_PUBLIC_KEYS_JSON contains no usable public keys');
  return Object.freeze(Object.fromEntries(entries) as Record<string, string>);
}
export function loadSearchConfig(env: NodeJS.ProcessEnv = process.env): SearchConfig {
  const threshold = Number(env.SEARCH_SIMILARITY_THRESHOLD ?? '0.3');
  if (!Number.isFinite(threshold) || threshold < 0 || threshold > 1) throw new Error('SEARCH_SIMILARITY_THRESHOLD must be between 0 and 1');
  return Object.freeze({
    port: positiveInteger('SEARCH_PORT', env.SEARCH_PORT, 3004),
    databaseUrl: readSecret(env.SEARCH_DATABASE_URL_FILE, env.SEARCH_DATABASE_URL, 'SEARCH_DATABASE_URL'),
    redisUrl: required('SEARCH_REDIS_URL', env.SEARCH_REDIS_URL), rabbitmqUrl: required('SEARCH_RABBITMQ_URL', env.SEARCH_RABBITMQ_URL),
    jwtPublicKeys: publicKeys(required('SEARCH_SERVICE_JWT_PUBLIC_KEYS_JSON', env.SEARCH_SERVICE_JWT_PUBLIC_KEYS_JSON)),
    jwtIssuer: required('SEARCH_SERVICE_JWT_ISSUER', env.SEARCH_SERVICE_JWT_ISSUER), jwtAudience: required('SEARCH_SERVICE_JWT_AUDIENCE', env.SEARCH_SERVICE_JWT_AUDIENCE), jwtScope: required('SEARCH_SERVICE_JWT_SCOPE', env.SEARCH_SERVICE_JWT_SCOPE),
    cacheTtlSeconds: positiveInteger('SEARCH_CACHE_TTL_SECONDS', env.SEARCH_CACHE_TTL_SECONDS, 60), cacheJitterSeconds: positiveInteger('SEARCH_CACHE_JITTER_SECONDS', env.SEARCH_CACHE_JITTER_SECONDS, 10),
    pageSizeMax: positiveInteger('SEARCH_PAGE_SIZE_MAX', env.SEARCH_PAGE_SIZE_MAX, 100), suggestLimitMax: positiveInteger('SEARCH_SUGGEST_LIMIT_MAX', env.SEARCH_SUGGEST_LIMIT_MAX, 20), similarityThreshold: threshold,
    dependencyTimeoutMs: positiveInteger('SEARCH_DEPENDENCY_TIMEOUT_MS', env.SEARCH_DEPENDENCY_TIMEOUT_MS, 3000), rabbitmqPrefetch: positiveInteger('SEARCH_RABBITMQ_PREFETCH', env.SEARCH_RABBITMQ_PREFETCH, 10),
    shutdownGraceMs: positiveInteger('SEARCH_SHUTDOWN_GRACE_MS', env.SEARCH_SHUTDOWN_GRACE_MS, 10_000), otelServiceName: env.SEARCH_OTEL_SERVICE_NAME?.trim() || 'stayhub-search-service',
  });
}
