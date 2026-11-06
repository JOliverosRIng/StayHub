import { generateKeyPairSync, randomBytes } from 'node:crypto';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const envPath = resolve(root, '.env.search');
const artifactDirectory = resolve(root, '.artifacts/search');
const privateKeyPath = resolve(artifactDirectory, 'service-private.pem');
const force = process.argv.includes('--force');

if (existsSync(envPath) && existsSync(privateKeyPath) && !force) {
  console.log('Reusing existing .env.search and .artifacts/search/service-private.pem');
  process.exit(0);
}

const secret = () => randomBytes(24).toString('hex');
const databasePassword = secret();
const redisPassword = secret();
const rabbitPassword = secret();
const { publicKey, privateKey } = generateKeyPairSync('rsa', {
  modulusLength: 2048,
  publicKeyEncoding: { type: 'spki', format: 'pem' },
  privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
});

const values = {
  SEARCH_DB_PASSWORD: databasePassword,
  SEARCH_REDIS_PASSWORD: redisPassword,
  SEARCH_RABBITMQ_PASSWORD: rabbitPassword,
  SEARCH_DATABASE_URL: `postgresql://stayhub_search:${databasePassword}@search-db:5432/search_db?schema=public`,
  SEARCH_REDIS_URL: `redis://:${redisPassword}@search-redis:6379/0`,
  SEARCH_RABBITMQ_URL: `amqp://stayhub_search:${rabbitPassword}@rabbitmq:5672/%2Fsearch`,
  SEARCH_RABBITMQ_EXCHANGE: 'stayhub.search.v1',
  SEARCH_RABBITMQ_QUEUE: 'stayhub.search.projection.v1',
  SEARCH_RABBITMQ_DLQ: 'stayhub.search.projection.v1.dlq',
  SEARCH_RABBITMQ_PREFETCH: '10',
  SEARCH_RABBITMQ_MAX_RETRIES: '3',
  SEARCH_RABBITMQ_RETRY_BASE_MS: '250',
  SEARCH_SERVICE_JWT_PUBLIC_KEYS_JSON: JSON.stringify({ 'search-dev-1': publicKey }),
  SEARCH_SERVICE_JWT_ISSUER: 'stayhub-search-dev-client',
  SEARCH_SERVICE_JWT_AUDIENCE: 'stayhub-search-service',
  SEARCH_SERVICE_JWT_SCOPE: 'search:invoke',
  SEARCH_CACHE_TTL_SECONDS: '60',
  SEARCH_CACHE_JITTER_SECONDS: '10',
  SEARCH_PAGE_SIZE_MAX: '100',
  SEARCH_SUGGEST_LIMIT_MAX: '20',
  SEARCH_SIMILARITY_THRESHOLD: '0.3',
  SEARCH_DEPENDENCY_TIMEOUT_MS: '3000',
  SEARCH_SHUTDOWN_GRACE_MS: '10000',
  SEARCH_OTEL_SERVICE_NAME: 'stayhub-search-service-dev',
  SEARCH_LOG_LEVEL: 'info',
  OTEL_EXPORTER_OTLP_ENDPOINT: 'http://127.0.0.1:4318',
};

mkdirSync(artifactDirectory, { recursive: true, mode: 0o700 });
writeFileSync(privateKeyPath, privateKey, { mode: 0o600 });
writeFileSync(envPath, `${Object.entries(values).map(([key, value]) => `${key}=${value}`).join('\n')}\n`, { mode: 0o600 });
console.log('Generated ignored development files: .env.search and .artifacts/search/service-private.pem');
