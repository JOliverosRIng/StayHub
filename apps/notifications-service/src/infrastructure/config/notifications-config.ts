import { createPublicKey } from 'node:crypto';
import { readFileSync } from 'node:fs';

export interface JwtVerificationConfig {
  issuer: string;
  audience: string;
  kid: string;
  publicKey: string;
  maxAgeSeconds: number;
}

export interface NotificationsConfig {
  port: number;
  databaseUrl: string;
  accessJwt: JwtVerificationConfig;
  serviceJwt: JwtVerificationConfig;
  sendScope: string;
  development: boolean;
}

export const NOTIFICATIONS_CONFIG = Symbol('NOTIFICATIONS_CONFIG');
export const NOTIFICATIONS_PORT = 3009;
export const ACCESS_JWT_MAX_AGE_SECONDS = 3600;
export const SERVICE_JWT_MAX_AGE_SECONDS = 300;

function required(key: string, env: NodeJS.ProcessEnv): string {
  let value: string | undefined;
  try {
    const file = env[`${key}_FILE`];
    value = file ? readFileSync(file, 'utf8').trim() : env[key];
  } catch {
    throw new Error(`Invalid configuration: ${key}`);
  }
  if (!value?.trim()) throw new Error(`Missing configuration: ${key}`);
  return value.trim();
}

function loadJwtConfig(prefix: string, maxAgeSeconds: number, env: NodeJS.ProcessEnv): JwtVerificationConfig {
  const keyName = `${prefix}_PUBLIC_KEY`;
  const publicKey = required(keyName, env).replace(/\\n/g, '\n');
  try {
    if (publicKey.includes('PRIVATE KEY')) throw new Error();
    const key = createPublicKey(publicKey);
    if (key.type !== 'public' || key.asymmetricKeyType !== 'rsa' || (key.asymmetricKeyDetails?.modulusLength ?? 0) < 2048) {
      throw new Error();
    }
  } catch {
    throw new Error(`Invalid configuration: ${keyName}`);
  }

  return {
    issuer: required(`${prefix}_ISSUER`, env),
    audience: required(`${prefix}_AUDIENCE`, env),
    kid: required(`${prefix}_KID`, env),
    publicKey,
    maxAgeSeconds,
  };
}

function validateDatabaseUrl(raw: string): string {
  try {
    const url = new URL(raw);
    if (!['postgres:', 'postgresql:'].includes(url.protocol)
      || url.pathname !== '/notifications_db'
      || !url.username
      || !url.password
      || !url.hostname) {
      throw new Error();
    }
  } catch {
    throw new Error('Invalid configuration: NOTIFICATIONS_DATABASE_URL');
  }
  return raw;
}

export function loadNotificationsConfig(env: NodeJS.ProcessEnv = process.env): NotificationsConfig {
  const port = Number(required('NOTIFICATIONS_PORT', env));
  if (!Number.isInteger(port) || port !== NOTIFICATIONS_PORT) {
    throw new Error('Invalid configuration: NOTIFICATIONS_PORT');
  }

  const databaseUrl = validateDatabaseUrl(required('NOTIFICATIONS_DATABASE_URL', env));
  const sendScope = required('NOTIFICATIONS_SEND_SCOPE', env);
  if (!/^[A-Za-z0-9][A-Za-z0-9:_-]{0,127}$/.test(sendScope)) {
    throw new Error('Invalid configuration: NOTIFICATIONS_SEND_SCOPE');
  }

  return {
    port,
    databaseUrl,
    accessJwt: loadJwtConfig('NOTIFICATIONS_JWT', ACCESS_JWT_MAX_AGE_SECONDS, env),
    serviceJwt: loadJwtConfig('NOTIFICATIONS_SERVICE_JWT', SERVICE_JWT_MAX_AGE_SECONDS, env),
    sendScope,
    development: env.NODE_ENV === 'development',
  };
}
