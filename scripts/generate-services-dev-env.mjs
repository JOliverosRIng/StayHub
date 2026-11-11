import { generateKeyPairSync, randomBytes } from 'node:crypto';
import { chmodSync, existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = fileURLToPath(new URL('../.artifacts/services/', import.meta.url));
mkdirSync(root, { recursive: true, mode: 0o700 });
chmodSync(root, 0o700);
const write = (name, contents) => writeFileSync(path.join(root, name), contents, { mode: 0o600 });
const env = (name, values) => write(name, Object.entries(values).map(([key, value]) => `${key}=${value}`).join('\n') + '\n');
for (const service of ['payments', 'notifications']) {
  if (existsSync(path.join(root, `${service}.env`))) continue;
  const password = randomBytes(24).toString('hex');
  const keys = generateKeyPairSync('rsa', { modulusLength: 2048, publicKeyEncoding: { type: 'spki', format: 'pem' }, privateKeyEncoding: { type: 'pkcs8', format: 'pem' } });
  write(`${service}-public.pem`, keys.publicKey);
  write(`${service}-private.pem`, keys.privateKey);
  write(`${service}-database-url`, `postgresql://stayhub_${service}:${password}@${service}-db:5432/${service}_db?schema=public`);
  env(`${service}-db.env`, { POSTGRES_DB: `${service}_db`, POSTGRES_USER: `stayhub_${service}`, POSTGRES_PASSWORD: password });
  const prefix = service.toUpperCase();
  const values = { NODE_ENV: 'production', [`${prefix}_PORT`]: service === 'payments' ? '3006' : '3009', [`${prefix}_DATABASE_URL_FILE`]: '/run/secrets/database_url' };
  for (const kind of ['JWT', 'SERVICE_JWT']) Object.assign(values, {
    [`${prefix}_${kind}_ISSUER`]: `stayhub-local-${service}`,
    [`${prefix}_${kind}_AUDIENCE`]: `stayhub-${service}-${kind === 'JWT' ? 'access' : 'service'}`,
    [`${prefix}_${kind}_KID`]: 'local-dev',
    [`${prefix}_${kind}_PUBLIC_KEY_FILE`]: '/run/secrets/jwt_public',
  });
  if (service === 'payments') {
    write('payments-token-hmac', randomBytes(48).toString('hex'));
    const rabbitPassword = randomBytes(24).toString('hex');
    env('rabbitmq.env', { RABBITMQ_DEFAULT_USER: 'stayhub_payments', RABBITMQ_DEFAULT_PASS: rabbitPassword });
    Object.assign(values, { PAYMENTS_TOKEN_HMAC_SECRET_FILE: '/run/secrets/token_hmac', PAYMENTS_RABBITMQ_URL: `amqp://stayhub_payments:${rabbitPassword}@payments-rabbitmq:5672`, PAYMENTS_RABBITMQ_EXCHANGE: 'stayhub.payments', OTEL_EXPORTER_OTLP_ENDPOINT: 'http://otel:4318' });
  } else Object.assign(values, { NOTIFICATIONS_SEND_SCOPE: 'notifications:send', NOTIFICATIONS_EMAIL_MODE: 'stub' });
  env(`${service}.env`, values);
}
for (const name of [
  'payments-database-url', 'payments-public.pem', 'payments-token-hmac',
  'notifications-database-url', 'notifications-public.pem',
]) {
  const file = path.join(root, name);
  if (existsSync(file)) chmodSync(file, 0o444);
}
console.log('Local service configuration ready in .artifacts/services (existing credentials preserved).');
