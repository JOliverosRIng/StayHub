import { createPublicKey, type JsonWebKey, type KeyObject } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { isAbsolute } from 'node:path';

export interface JwtConfig { issuer: string; audience: string; kid: string; publicKey: string }
export interface ServiceJwtConfig extends JwtConfig { scope: string }
export interface AccommodationsConfig {
  port: number; databaseUrl: string; jwt: JwtConfig; serviceJwt: ServiceJwtConfig; photoStorageRoot: string; otlpEndpoint: string; development: boolean;
}
export const ACCOMMODATIONS_CONFIG = Symbol('ACCOMMODATIONS_CONFIG');
export const ACCOMMODATIONS_PORT = 3003;

export function loadAccommodationsConfig(env: NodeJS.ProcessEnv = process.env): AccommodationsConfig {
  const optional = (key: string): string | undefined => {
    let value: string | undefined;
    try { value = env[`${key}_FILE`] ? readFileSync(env[`${key}_FILE`]!, 'utf8').trim() : env[key]; }
    catch { throw new Error(`Invalid configuration: ${key}`); }
    return value?.trim() ? value : undefined;
  };
  const required = (key: string): string => {
    const value = optional(key);
    if (!value) throw new Error(`Missing configuration: ${key}`);
    return value;
  };

  const databaseUrl = required('ACCOMMODATIONS_DATABASE_URL');
  try {
    const url = new URL(databaseUrl);
    if (!['postgres:', 'postgresql:'].includes(url.protocol) || url.pathname !== '/accommodations_db' || !url.username || !url.password || !url.hostname) throw new Error();
  } catch { throw new Error('Invalid configuration: ACCOMMODATIONS_DATABASE_URL'); }

  const port = Number(required('ACCOMMODATIONS_PORT'));
  if (port !== ACCOMMODATIONS_PORT) throw new Error('Invalid configuration: ACCOMMODATIONS_PORT');

  const photoStorageRoot = required('ACCOMMODATIONS_PHOTO_STORAGE_ROOT');
  if (!isAbsolute(photoStorageRoot)) throw new Error('Invalid configuration: ACCOMMODATIONS_PHOTO_STORAGE_ROOT');

  const otlpEndpoint = required('OTEL_EXPORTER_OTLP_ENDPOINT');
  try { if (!['http:', 'https:'].includes(new URL(otlpEndpoint).protocol)) throw new Error(); }
  catch { throw new Error('Invalid configuration: OTEL_EXPORTER_OTLP_ENDPOINT'); }

  const issuer = required('ACCOMMODATIONS_JWT_ISSUER');
  const audience = required('ACCOMMODATIONS_JWT_AUDIENCE');
  const kid = required('ACCOMMODATIONS_JWT_KID');
  const pem = optional('ACCOMMODATIONS_JWT_PUBLIC_KEY');
  const jwks = optional('ACCOMMODATIONS_JWT_JWKS');
  if (pem && jwks) throw new Error('Configure exactly one of ACCOMMODATIONS_JWT_PUBLIC_KEY or ACCOMMODATIONS_JWT_JWKS');
  let publicKey: string;
  if (jwks) publicKey = keyFromJwks(jwks, kid);
  else if (pem) publicKey = keyFromPem(pem);
  else throw new Error('Missing configuration: ACCOMMODATIONS_JWT_PUBLIC_KEY');

  const serviceIssuer = required('ACCOMMODATIONS_SERVICE_JWT_ISSUER');
  const serviceAudience = required('ACCOMMODATIONS_SERVICE_JWT_AUDIENCE');
  const serviceKid = required('ACCOMMODATIONS_SERVICE_JWT_KID');
  const servicePem = optional('ACCOMMODATIONS_SERVICE_JWT_PUBLIC_KEY');
  const serviceJwks = optional('ACCOMMODATIONS_SERVICE_JWT_JWKS');
  if (servicePem && serviceJwks) throw new Error('Configure exactly one of ACCOMMODATIONS_SERVICE_JWT_PUBLIC_KEY or ACCOMMODATIONS_SERVICE_JWT_JWKS');
  let servicePublicKey: string;
  if (serviceJwks) servicePublicKey = keyFromJwks(serviceJwks, serviceKid);
  else if (servicePem) servicePublicKey = keyFromPem(servicePem);
  else throw new Error('Missing configuration: ACCOMMODATIONS_SERVICE_JWT_PUBLIC_KEY');
  const bookingQuoteScope = optional('ACCOMMODATIONS_BOOKING_QUOTE_SCOPE') || 'accommodations:booking-quote';

  return {
    port, databaseUrl, jwt: { issuer, audience, kid, publicKey }, serviceJwt: { issuer: serviceIssuer, audience: serviceAudience, kid: serviceKid, publicKey: servicePublicKey, scope: bookingQuoteScope },
    photoStorageRoot, otlpEndpoint, development: env.NODE_ENV === 'development',
  };
}

function assertRsaVerificationKey(key: KeyObject): string {
  if (key.type !== 'public' || key.asymmetricKeyType !== 'rsa' || (key.asymmetricKeyDetails?.modulusLength ?? 0) < 2048) throw new Error();
  return key.export({ type: 'spki', format: 'pem' }).toString();
}

function keyFromPem(raw: string): string {
  const pem = raw.replace(/\\n/g, '\n');
  try {
    if (pem.includes('PRIVATE KEY')) throw new Error();
    return assertRsaVerificationKey(createPublicKey(pem));
  } catch { throw new Error('Invalid configuration: ACCOMMODATIONS_JWT_PUBLIC_KEY'); }
}

function keyFromJwks(raw: string, kid: string): string {
  try {
    const parsed = JSON.parse(raw) as { keys?: unknown };
    if (!Array.isArray(parsed.keys)) throw new Error();
    const jwk = (parsed.keys as JsonWebKey[]).find((key) => key && typeof key === 'object' && key.kid === kid);
    if (!jwk || jwk.kty !== 'RSA' || 'd' in jwk || (jwk.alg !== undefined && jwk.alg !== 'RS256') || (jwk.use !== undefined && jwk.use !== 'sig')) throw new Error();
    return assertRsaVerificationKey(createPublicKey({ key: jwk, format: 'jwk' }));
  } catch { throw new Error('Invalid configuration: ACCOMMODATIONS_JWT_JWKS'); }
}
