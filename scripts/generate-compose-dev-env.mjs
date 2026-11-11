#!/usr/bin/env node

import { createPublicKey, generateKeyPairSync } from 'node:crypto';
import { chmodSync, existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { importPKCS8, SignJWT } from 'jose';

import {
  ACCESS_KID,
  ensureDevEnvironment,
  envValue,
  INBOUND_AUDIENCE,
  INBOUND_ISSUER,
  INBOUND_KID,
  INBOUND_SCOPE,
  secret,
} from './lib/dev-env.mjs';

const root = resolve(import.meta.dirname, '..');
const envPath = join(root, '.env');
const secretsDirectory = join(root, 'secrets');
const gatewayArtifacts = join(root, '.artifacts', 'gateway');

ensureDevEnvironment({ root });
mkdirSync(secretsDirectory, { recursive: true, mode: 0o700 });
mkdirSync(gatewayArtifacts, { recursive: true, mode: 0o700 });
chmodSync(secretsDirectory, 0o700);
chmodSync(gatewayArtifacts, 0o700);

function writeSecret(path, value) {
  writeFileSync(path, value.endsWith('\n') ? value : `${value}\n`, {
    encoding: 'utf8',
    mode: 0o600,
  });
  chmodSync(path, 0o600);
}

function persistentSecret(name) {
  const path = join(secretsDirectory, name);
  if (!existsSync(path)) writeSecret(path, secret());
  return readFileSync(path, 'utf8').trim();
}

function persistentRsaPair(name) {
  const privatePath = join(secretsDirectory, `${name}-private.pem`);
  const publicPath = join(secretsDirectory, `${name}-public.pem`);
  if (!existsSync(privatePath)) {
    const pair = generateKeyPairSync('rsa', {
      modulusLength: 2048,
      publicKeyEncoding: { type: 'spki', format: 'pem' },
      privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
    });
    writeSecret(privatePath, pair.privateKey);
    writeSecret(publicPath, pair.publicKey);
  } else {
    const privateKey = readFileSync(privatePath, 'utf8');
    const publicKey = createPublicKey(privateKey).export({ type: 'spki', format: 'pem' });
    writeSecret(publicPath, publicKey);
  }
  return {
    privateKey: readFileSync(privatePath, 'utf8'),
    publicKey: readFileSync(publicPath, 'utf8'),
  };
}

function ensureTlsCertificate() {
  const keyPath = join(gatewayArtifacts, 'tls_key.pem');
  const certificatePath = join(gatewayArtifacts, 'tls_cert.pem');
  if (!existsSync(keyPath) || !existsSync(certificatePath)) {
    const result = spawnSync('openssl', [
      'req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-sha256', '-days', '825',
      '-subj', '/CN=localhost',
      '-addext', 'subjectAltName=DNS:localhost,IP:127.0.0.1',
      '-keyout', keyPath,
      '-out', certificatePath,
    ], { encoding: 'utf8' });
    if (result.status !== 0) {
      throw new Error(`No se pudo generar el certificado TLS local: ${result.stderr.trim()}`);
    }
  }
  chmodSync(keyPath, 0o600);
  chmodSync(certificatePath, 0o600);
}

async function serviceToken({ privateKey, kid, issuer, audience, subject, scope }) {
  return new SignJWT({ scope })
    .setProtectedHeader({ alg: 'RS256', kid, typ: 'JWT' })
    .setIssuer(issuer)
    .setAudience(audience)
    .setSubject(subject)
    .setIssuedAt()
    .setExpirationTime('30d')
    .sign(await importPKCS8(privateKey, 'RS256'));
}

function replaceEnvironment(values) {
  const seen = new Set();
  const lines = readFileSync(envPath, 'utf8').split(/\r?\n/).map((line) => {
    const match = /^([A-Z0-9_]+)=/.exec(line);
    if (!match || !(match[1] in values)) return line;
    seen.add(match[1]);
    return `${match[1]}=${envValue(values[match[1]])}`;
  });
  const missing = Object.entries(values)
    .filter(([name]) => !seen.has(name))
    .map(([name, value]) => `${name}=${envValue(value)}`);
  const rendered = [...lines, '', '# Generated local Compose overrides', ...missing].join('\n');
  writeFileSync(envPath, rendered.endsWith('\n') ? rendered : `${rendered}\n`, {
    encoding: 'utf8',
    mode: 0o600,
  });
  chmodSync(envPath, 0o600);
}

ensureTlsCertificate();

const accessPublicKey = readFileSync(join(secretsDirectory, 'access-public.pem'), 'utf8');
const gatewayPrivateKey = readFileSync(join(secretsDirectory, 'gateway-private.pem'), 'utf8');
const gatewayPublicKey = createPublicKey(gatewayPrivateKey).export({ type: 'spki', format: 'pem' });
const bookingsKeys = persistentRsaPair('bookings-service');

writeSecret(join(gatewayArtifacts, 'service_private_key.pem'), gatewayPrivateKey);
const gatewayRedisPassword = persistentSecret('gateway-redis-password.txt');
writeSecret(join(gatewayArtifacts, 'redis_password.txt'), gatewayRedisPassword);

const databasePasswords = {
  accommodations: persistentSecret('accommodations-db-password.txt'),
  bookings: persistentSecret('bookings-db-password.txt'),
  reviews: persistentSecret('reviews-db-password.txt'),
  payments: persistentSecret('payments-db-password.txt'),
  notifications: persistentSecret('notifications-db-password.txt'),
  search: persistentSecret('search-db-password.txt'),
};
const searchRedisPassword = persistentSecret('search-redis-password.txt');
const searchRabbitPassword = persistentSecret('search-rabbitmq-password.txt');
const bookingsRabbitPassword = persistentSecret('bookings-rabbitmq-password.txt');

const databaseUrls = {
  accommodations: `postgresql://stayhub_accommodations:${databasePasswords.accommodations}@accommodations-db:5432/accommodations_db?schema=public`,
  bookings: `postgresql://stayhub_bookings:${databasePasswords.bookings}@bookings-db:5432/bookings_db?schema=public`,
  reviews: `postgresql://stayhub_reviews:${databasePasswords.reviews}@reviews-db:5432/reviews_db?schema=public`,
  payments: `postgresql://stayhub_payments:${databasePasswords.payments}@payments-db:5432/payments_db?schema=public`,
  notifications: `postgresql://stayhub_notifications:${databasePasswords.notifications}@notifications-db:5432/notifications_db?schema=public`,
  search: `postgresql://stayhub_search:${databasePasswords.search}@search-db:5432/search_db?schema=public`,
};

for (const service of ['accommodations', 'bookings', 'reviews', 'payments', 'notifications', 'search']) {
  writeSecret(join(secretsDirectory, `${service}-database-url.txt`), databaseUrls[service]);
}
writeSecret(
  join(secretsDirectory, 'bookings-rabbitmq-url.txt'),
  `amqp://stayhub_bookings:${bookingsRabbitPassword}@bookings-rabbitmq:5672/%2Fbookings`,
);
writeSecret(join(secretsDirectory, 'payments-token-hmac-secret.txt'), persistentSecret('payments-token-hmac-value.txt'));

const bookingsIssuer = 'stayhub-bookings-service';
const outboundTokens = {
  'accommodations-service:accommodations:booking-quote': await serviceToken({
    privateKey: bookingsKeys.privateKey,
    kid: 'bookings-accommodations-2026-01',
    issuer: bookingsIssuer,
    audience: 'stayhub-accommodations-service',
    subject: 'bookings-service',
    scope: 'accommodations:booking-quote',
  }),
  'payments-service:payments:charge': await serviceToken({
    privateKey: bookingsKeys.privateKey,
    kid: 'bookings-payments-2026-01',
    issuer: bookingsIssuer,
    audience: 'stayhub-payments-service',
    subject: 'bookings-service',
    scope: 'payments:charge',
  }),
  'payments-service:payments:refund': await serviceToken({
    privateKey: bookingsKeys.privateKey,
    kid: 'bookings-payments-2026-01',
    issuer: bookingsIssuer,
    audience: 'stayhub-payments-service',
    subject: 'bookings-service',
    scope: 'payments:refund',
  }),
};
const notificationsToken = await serviceToken({
  privateKey: bookingsKeys.privateKey,
  kid: 'bookings-notifications-2026-01',
  issuer: bookingsIssuer,
  audience: 'stayhub-notifications-service',
  subject: 'bookings-service',
  scope: 'notifications:send',
});
const reviewsBookingsToken = await serviceToken({
  privateKey: gatewayPrivateKey,
  kid: INBOUND_KID,
  issuer: INBOUND_ISSUER,
  audience: 'stayhub-bookings-service',
  subject: 'reviews-service',
  scope: 'reviews:eligibility',
});

writeSecret(join(secretsDirectory, 'bookings-outbound-service-tokens.json'), JSON.stringify(outboundTokens));
writeSecret(join(secretsDirectory, 'bookings-notifications-service-token.txt'), notificationsToken);
writeSecret(join(secretsDirectory, 'reviews-bookings-service-token.txt'), reviewsBookingsToken);

const accessKeysJson = JSON.stringify({ [ACCESS_KID]: accessPublicKey });
const gatewayKeysJson = JSON.stringify({ [INBOUND_KID]: gatewayPublicKey });
replaceEnvironment({
  GATEWAY_PROTOCOL: 'https',
  GATEWAY_JWT_PUBLIC_KEYS_JSON: accessKeysJson,
  GATEWAY_SERVICE_KID: INBOUND_KID,
  GATEWAY_SERVICE_ISSUER: INBOUND_ISSUER,
  GATEWAY_SERVICE_AUDIENCE: INBOUND_AUDIENCE,
  GATEWAY_SERVICE_SCOPE: INBOUND_SCOPE,
  GATEWAY_REDIS_PASSWORD: gatewayRedisPassword,
  GATEWAY_REDIS_URL: `redis://:${gatewayRedisPassword}@gateway-redis:6379/0`,
  GATEWAY_TLS_CERT_SOURCE: './.artifacts/gateway/tls_cert.pem',
  GATEWAY_TLS_KEY_SOURCE: './.artifacts/gateway/tls_key.pem',
  GATEWAY_REDIS_PASSWORD_SOURCE: './.artifacts/gateway/redis_password.txt',
  GATEWAY_SERVICE_PRIVATE_KEY_SOURCE: './.artifacts/gateway/service_private_key.pem',
  AUTH_INBOUND_SERVICE_PUBLIC_KEYS_JSON: gatewayKeysJson,
  AUTH_INBOUND_SERVICE_ISSUER: INBOUND_ISSUER,
  AUTH_INBOUND_SERVICE_AUDIENCE: INBOUND_AUDIENCE,
  AUTH_INBOUND_SERVICE_SCOPE: INBOUND_SCOPE,
  SEARCH_DB_PASSWORD: databasePasswords.search,
  SEARCH_REDIS_PASSWORD: searchRedisPassword,
  SEARCH_RABBITMQ_PASSWORD: searchRabbitPassword,
  SEARCH_DATABASE_URL: databaseUrls.search,
  SEARCH_REDIS_URL: `redis://:${searchRedisPassword}@search-redis:6379/0`,
  SEARCH_RABBITMQ_URL: `amqp://stayhub_search:${searchRabbitPassword}@rabbitmq:5672/%2Fsearch`,
  SEARCH_SERVICE_JWT_PUBLIC_KEYS_JSON: gatewayKeysJson,
  SEARCH_SERVICE_JWT_ISSUER: INBOUND_ISSUER,
  SEARCH_SERVICE_JWT_AUDIENCE: 'stayhub-search-service',
  ACCOMMODATIONS_DB_PASSWORD: databasePasswords.accommodations,
  ACCOMMODATIONS_DATABASE_URL: databaseUrls.accommodations,
  ACCOMMODATIONS_TEST_DATABASE_URL: `postgresql://stayhub_accommodations:${databasePasswords.accommodations}@127.0.0.1:55435/accommodations_db?schema=public`,
  BOOKINGS_DB_PASSWORD: databasePasswords.bookings,
  BOOKINGS_DATABASE_URL: databaseUrls.bookings,
  BOOKINGS_TEST_DATABASE_URL: `postgresql://stayhub_bookings:${databasePasswords.bookings}@127.0.0.1:55433/bookings_db?schema=public`,
  BOOKINGS_SERVICE_JWT_PUBLIC_KEYS_JSON: gatewayKeysJson,
  BOOKINGS_SERVICE_JWT_ISSUER: INBOUND_ISSUER,
  BOOKINGS_SERVICE_JWT_AUDIENCE: 'stayhub-bookings-service',
  BOOKINGS_RABBITMQ_PASSWORD: bookingsRabbitPassword,
  BOOKINGS_RABBITMQ_URL: `amqp://stayhub_bookings:${bookingsRabbitPassword}@bookings-rabbitmq:5672/%2Fbookings`,
  BOOKINGS_OUTBOUND_SERVICE_TOKENS_JSON: JSON.stringify(outboundTokens),
  REVIEWS_DB_PASSWORD: databasePasswords.reviews,
  REVIEWS_DATABASE_URL: databaseUrls.reviews,
  REVIEWS_TEST_DATABASE_URL: `postgresql://stayhub_reviews:${databasePasswords.reviews}@127.0.0.1:55434/reviews_db?schema=public`,
  REVIEWS_USER_JWT_PUBLIC_KEYS_JSON: accessKeysJson,
  REVIEWS_GATEWAY_JWT_PUBLIC_KEYS_JSON: gatewayKeysJson,
  REVIEWS_GATEWAY_JWT_ISSUER: INBOUND_ISSUER,
  REVIEWS_GATEWAY_JWT_AUDIENCE: 'stayhub-reviews-service',
  PAYMENTS_SERVICE_JWT_ISSUER: bookingsIssuer,
  NOTIFICATIONS_SERVICE_JWT_ISSUER: bookingsIssuer,
  ACCOMMODATIONS_SERVICE_JWT_ISSUER: bookingsIssuer,
});

// Keep host-side secret material private. Compose consumers opt out of Podman's
// label confinement explicitly; Unix permissions can therefore remain strict.
for (const directory of [secretsDirectory, gatewayArtifacts]) {
  for (const name of readdirSync(directory)) chmodSync(join(directory, name), 0o600);
}

console.log('[compose-env] .env y secretos locales del Compose están completos.');
console.log('[compose-env] Las credenciales existentes se conservaron; los tokens de servicio se renovaron por 30 días.');
