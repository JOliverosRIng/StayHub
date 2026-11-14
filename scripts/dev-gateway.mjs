import { spawn, spawnSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { ensureDevEnvironment, parseEnv, secret, INBOUND_KID, INBOUND_ISSUER, INBOUND_AUDIENCE, INBOUND_SCOPE } from './lib/dev-env.mjs';
const root = fileURLToPath(new URL('..', import.meta.url));
const dev = ensureDevEnvironment({ root });
const values = Object.fromEntries(parseEnv(readFileSync(dev.envPath, 'utf8')));
const passwordFile = join(dev.secretsDir, 'gateway-redis-password.txt');
if (!existsSync(passwordFile)) writeFileSync(passwordFile, secret(), { mode: 0o600 });
const password = readFileSync(passwordFile, 'utf8');
const engine = ['docker', 'podman'].find(name => spawnSync(name, ['--version'], { stdio: 'ignore' }).status === 0);
if (!engine) throw new Error('Docker or Podman required');
const compose = spawnSync(engine === 'docker' ? engine : 'podman-compose', [...(engine === 'docker' ? ['compose'] : []), '-f', 'infra/docker/dev/compose.gateway.yml', 'up', '-d', '--wait'], {
  cwd: root, stdio: 'inherit', env: { ...process.env, DEV_GATEWAY_REDIS_PASSWORD: password },
});
if (compose.status !== 0) throw new Error('Gateway Redis did not start');
const npmCli = process.env.npm_execpath;
if (!npmCli) throw new Error('Start with npm run dev:gateway');
const build = spawnSync(process.execPath, [npmCli, 'run', 'build:gateway'], { cwd: root, stdio: 'inherit' });
if (build.status !== 0) throw new Error('Gateway build failed');
const env = {
  ...process.env, NODE_ENV: 'development',
  GATEWAY_PORT: '8080', GATEWAY_API_PREFIX: '/api/v1',
  GATEWAY_PROTOCOL: 'http',
  GATEWAY_AUTH_BASE_URL: 'http://127.0.0.1:3001',
  GATEWAY_USERS_BASE_URL: 'http://127.0.0.1:3002',
  GATEWAY_JWT_PUBLIC_KEYS_JSON: values.AUTH_JWT_PUBLIC_KEYS_JSON,
  GATEWAY_JWT_ISSUER: values.AUTH_JWT_ISSUER,
  GATEWAY_JWT_AUDIENCE: values.AUTH_JWT_AUDIENCE,
  GATEWAY_SERVICE_KID: INBOUND_KID,
  GATEWAY_SERVICE_PRIVATE_KEY_FILE: join(dev.secretsDir, 'gateway-private.pem'),
  GATEWAY_SERVICE_ISSUER: INBOUND_ISSUER,
  GATEWAY_SERVICE_AUDIENCE: INBOUND_AUDIENCE,
  GATEWAY_SERVICE_SCOPE: INBOUND_SCOPE,
  GATEWAY_SERVICE_TTL_SECONDS: '60',
  GATEWAY_REDIS_URL: 'redis://127.0.0.1:56381/0',
  GATEWAY_REDIS_PASSWORD_FILE: passwordFile,
  GATEWAY_REDIS_NAMESPACE: 'stayhub-gateway-dev',
  GATEWAY_TRUSTED_PROXY_CIDRS: '127.0.0.1/32',
  GATEWAY_REGISTER_RATE_LIMIT: '10',
  GATEWAY_REGISTER_RATE_WINDOW_SECONDS: '600',
  GATEWAY_LOGIN_RATE_LIMIT: '30',
  GATEWAY_LOGIN_RATE_WINDOW_SECONDS: '300',
  GATEWAY_MAX_PHOTO_BYTES: '5000000',
  GATEWAY_AUTH_TIMEOUT_MS: '5000',
  GATEWAY_AUTH_CIRCUIT_FAILURE_THRESHOLD: '5',
  GATEWAY_AUTH_CIRCUIT_RESET_MS: '30000',
  GATEWAY_USERS_TIMEOUT_MS: '5000', GATEWAY_USERS_CIRCUIT_FAILURE_THRESHOLD: '5', GATEWAY_USERS_CIRCUIT_RESET_MS: '30000',
  GATEWAY_INTROSPECTION_TIMEOUT_MS: '5000',
  GATEWAY_OTEL_EXPORTER_OTLP_ENDPOINT: 'http://127.0.0.1:4318', GATEWAY_OTEL_SERVICE_NAME: 'stayhub-api-gateway',
  // Reseñas y Reservas: el Gateway las exige al arrancar (gateway-config.ts). Valores de docker-compose.yml.
  GATEWAY_REVIEWS_BASE_URL: 'http://127.0.0.1:3007',
  GATEWAY_REVIEWS_SERVICE_AUDIENCE: 'stayhub-reviews-service', GATEWAY_REVIEWS_SERVICE_SCOPE: 'reviews:read',
  GATEWAY_REVIEWS_TIMEOUT_MS: '3000', GATEWAY_REVIEWS_CIRCUIT_FAILURE_THRESHOLD: '5', GATEWAY_REVIEWS_CIRCUIT_RESET_MS: '30000',
  GATEWAY_BOOKINGS_BASE_URL: 'http://127.0.0.1:3005',
  GATEWAY_BOOKINGS_SERVICE_AUDIENCE: 'stayhub-bookings-service', GATEWAY_BOOKINGS_SERVICE_SCOPE: 'bookings:invoke',
  GATEWAY_BOOKINGS_WRITE_RATE_LIMIT: '10', GATEWAY_BOOKINGS_WRITE_RATE_WINDOW_SECONDS: '60',
  GATEWAY_BOOKINGS_READ_RATE_LIMIT: '60', GATEWAY_BOOKINGS_READ_RATE_WINDOW_SECONDS: '60',
  GATEWAY_BOOKINGS_TIMEOUT_MS: '5000', GATEWAY_BOOKINGS_CIRCUIT_FAILURE_THRESHOLD: '5', GATEWAY_BOOKINGS_CIRCUIT_RESET_MS: '30000',
  // Alojamientos (bearer del usuario) y Búsqueda (service JWT). Procesos de `npm run dev:backend`.
  GATEWAY_ACCOMMODATIONS_BASE_URL: 'http://127.0.0.1:3003',
  GATEWAY_ACCOMMODATIONS_TIMEOUT_MS: '5000', GATEWAY_ACCOMMODATIONS_CIRCUIT_FAILURE_THRESHOLD: '5', GATEWAY_ACCOMMODATIONS_CIRCUIT_RESET_MS: '30000',
  GATEWAY_SEARCH_BASE_URL: 'http://127.0.0.1:3004',
  GATEWAY_SEARCH_SERVICE_AUDIENCE: 'stayhub-search-service', GATEWAY_SEARCH_SERVICE_SCOPE: 'search:invoke',
  GATEWAY_SEARCH_TIMEOUT_MS: '3000', GATEWAY_SEARCH_CIRCUIT_FAILURE_THRESHOLD: '5', GATEWAY_SEARCH_CIRCUIT_RESET_MS: '30000',
};
const child = spawn(process.execPath, ['dist/apps/api-gateway/main.js'], { cwd: root, env, stdio: 'inherit' });
process.on('SIGINT', () => child.kill('SIGINT')); process.on('SIGTERM', () => child.kill('SIGTERM'));
child.on('exit', code => { process.exitCode = code ?? 1; });
