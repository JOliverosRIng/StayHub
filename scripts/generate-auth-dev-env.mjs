#!/usr/bin/env node
import { generateKeyPairSync, randomBytes } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const examplePath = `${root}/.env.example`;
const envPath = `${root}/.env`;

function rsaPair() {
  const { publicKey, privateKey } = generateKeyPairSync('rsa', {
    modulusLength: 2048,
    publicKeyEncoding: { type: 'spki', format: 'pem' },
    privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
  });
  return { publicKey, privateKey };
}

function secret() {
  return randomBytes(48).toString('base64url');
}

function envValue(value) {
  return String(value).replace(/\n/g, '\\n');
}

const access = rsaPair();
const inbound = rsaPair();
const outbound = rsaPair();
const dbPassword = secret();
const redisPassword = secret();

const replacements = {
  AUTH_DATABASE_URL: `postgresql://stayhub_auth:${dbPassword}@auth-db:5432/auth_db?schema=public`,
  AUTH_REDIS_URL: `redis://:${redisPassword}@auth-redis:6379/0`,
  AUTH_REDIS_PASSWORD: redisPassword,
  AUTH_DB_PASSWORD: dbPassword,
  AUTH_JWT_ACTIVE_KID: 'stayhub-auth-dev',
  AUTH_JWT_PRIVATE_KEY: access.privateKey,
  AUTH_JWT_PUBLIC_KEYS_JSON: JSON.stringify({ 'stayhub-auth-dev': access.publicKey }),
  AUTH_INBOUND_SERVICE_PUBLIC_KEYS_JSON: JSON.stringify({ 'gateway-dev': inbound.publicKey }),
  AUTH_INBOUND_SERVICE_ISSUER: 'stayhub-dev-gateway',
  AUTH_INBOUND_SERVICE_AUDIENCE: 'stayhub-auth-service-dev',
  USERS_SERVICE_URL: 'http://users-stub:4000',
  AUTH_OUTBOUND_SERVICE_PRIVATE_KEY: outbound.privateKey,
  AUTH_OUTBOUND_SERVICE_KID: 'auth-users-dev',
  AUTH_OUTBOUND_SERVICE_ISSUER: 'stayhub-auth-service-dev',
  AUTH_OUTBOUND_SERVICE_AUDIENCE: 'stayhub-users-service-dev',
  AUTH_REFRESH_TOKEN_HMAC_SECRET: secret(),
  AUTH_REGISTRATION_FINGERPRINT_SECRET: secret(),
  AUTH_LOGIN_IDENTIFIER_HMAC_SECRET: secret(),
  NODE_ENV: 'development',
};

const generated = readFileSync(examplePath, 'utf8')
  .split(/\r?\n/)
  .map((line) => {
    const match = /^([A-Z0-9_]+)=/.exec(line);
    if (!match || !(match[1] in replacements)) return line;
    return `${match[1]}=${envValue(replacements[match[1]])}`;
  })
  .join('\n');

writeFileSync(envPath, generated.endsWith('\n') ? generated : `${generated}\n`, {
  encoding: 'utf8',
  mode: 0o600,
});

console.log('[auth-env] .env de desarrollo generado con secretos y claves RSA locales.');
