import { createPublicKey } from 'node:crypto';
import { readFileSync } from 'node:fs';

export interface JwtConfig { issuer: string; audience: string; kid: string; publicKey: string }
export interface UsersConfig {
  port: number; databaseUrl: string; userJwt: JwtConfig; serviceJwt: JwtConfig;
  registrationScope: string; lookupScope: string; maxPhotoBytes: number; otlpEndpoint: string; development: boolean;
}
export const USERS_CONFIG = Symbol('USERS_CONFIG');

export function loadUsersConfig(env: NodeJS.ProcessEnv = process.env): UsersConfig {
  const required = (key: string): string => {
    let value: string | undefined;
    try { value = env[`${key}_FILE`] ? readFileSync(env[`${key}_FILE`]!, 'utf8').trim() : env[key]; }
    catch { throw new Error(`Invalid configuration: ${key}`); }
    if (!value?.trim()) throw new Error(`Missing configuration: ${key}`);
    return value;
  };
  const jwt = (prefix: string): JwtConfig => {
    const publicKey = required(`${prefix}_PUBLIC_KEY`).replace(/\\n/g, '\n');
    try {
      if (publicKey.includes('PRIVATE KEY')) throw new Error();
      const key = createPublicKey(publicKey);
      if (key.asymmetricKeyType !== 'rsa' || (key.asymmetricKeyDetails?.modulusLength ?? 0) < 2048) throw new Error();
    } catch { throw new Error(`Invalid configuration: ${prefix}_PUBLIC_KEY`); }
    return { issuer: required(`${prefix}_ISSUER`), audience: required(`${prefix}_AUDIENCE`), kid: required(`${prefix}_KID`), publicKey };
  };
  const databaseUrl = required('USERS_DATABASE_URL');
  try {
    const url = new URL(databaseUrl);
    if (!['postgres:', 'postgresql:'].includes(url.protocol) || url.pathname !== '/users_db' || !url.username || !url.password || !url.hostname) throw new Error();
  } catch { throw new Error('Invalid configuration: USERS_DATABASE_URL'); }
  const port = Number(required('USERS_PORT'));
  const maxPhotoBytes = Number(required('USERS_MAX_PHOTO_BYTES'));
  if (port !== 3002 || maxPhotoBytes !== 5_000_000) throw new Error('Invalid Users port/photo limit');
  const otlpEndpoint = required('OTEL_EXPORTER_OTLP_ENDPOINT');
  try { if (!['http:', 'https:'].includes(new URL(otlpEndpoint).protocol)) throw new Error(); }
  catch { throw new Error('Invalid configuration: OTEL_EXPORTER_OTLP_ENDPOINT'); }
  const registrationScope = required('USERS_REGISTRATION_SCOPE');
  const lookupScope = required('USERS_LOOKUP_SCOPE');
  if (registrationScope === lookupScope || /\s/.test(registrationScope + lookupScope)) throw new Error('Service scopes must be distinct');
  return { port, databaseUrl, userJwt: jwt('USERS_JWT'), serviceJwt: jwt('USERS_SERVICE_JWT'), registrationScope, lookupScope, maxPhotoBytes, otlpEndpoint, development: env.NODE_ENV === 'development' };
}
