import { generateKeyPairSync } from 'node:crypto';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { loadAccommodationsConfig } from '../../src/infrastructure/config/accommodations-config';
import { accessKeys, publicKeyPem } from '../fixtures/config.fixture';

const root = mkdtempSync(join(tmpdir(), 'accommodations-config-'));
export const validEnv = {
  ACCOMMODATIONS_PORT: '3003',
  ACCOMMODATIONS_DATABASE_URL: 'postgresql://accommodations:synthetic@localhost:5432/accommodations_db',
  ACCOMMODATIONS_JWT_ISSUER: 'auth', ACCOMMODATIONS_JWT_AUDIENCE: 'api', ACCOMMODATIONS_JWT_KID: 'access-v1',
  ACCOMMODATIONS_JWT_PUBLIC_KEY: publicKeyPem,
  ACCOMMODATIONS_SERVICE_JWT_ISSUER: 'bookings',
  ACCOMMODATIONS_SERVICE_JWT_AUDIENCE: 'accommodations-service',
  ACCOMMODATIONS_SERVICE_JWT_KID: 'service-v1',
  ACCOMMODATIONS_SERVICE_JWT_PUBLIC_KEY: publicKeyPem,
  ACCOMMODATIONS_PHOTO_STORAGE_ROOT: root,
  OTEL_EXPORTER_OTLP_ENDPOINT: 'http://localhost:4318',
};
const jwk = { ...accessKeys.publicKey.export({ format: 'jwk' }), kid: 'access-v1', alg: 'RS256', use: 'sig' };

describe('ACC-005/007 configuration fail-fast', () => {
  it('accepts the Accommodations configuration on internal port 3003', () => {
    const config = loadAccommodationsConfig(validEnv);
    expect(config).toMatchObject({ port: 3003, photoStorageRoot: root, development: false, jwt: { issuer: 'auth', audience: 'api', kid: 'access-v1' }, serviceJwt: { issuer: 'bookings', audience: 'accommodations-service', kid: 'service-v1', scope: 'accommodations:booking-quote' } });
    expect(config.jwt.publicKey).toContain('BEGIN PUBLIC KEY');
  });

  it('uses the booking quote scope default and accepts an override', () => {
    expect(loadAccommodationsConfig(validEnv).serviceJwt.scope).toBe('accommodations:booking-quote');
    expect(loadAccommodationsConfig({ ...validEnv, ACCOMMODATIONS_BOOKING_QUOTE_SCOPE: 'custom:quote' }).serviceJwt.scope).toBe('custom:quote');
  });

  it.each(Object.keys(validEnv))('requires %s', (key) => {
    expect(() => loadAccommodationsConfig({ ...validEnv, [key]: '' })).toThrow();
    const without: Record<string, string> = { ...validEnv };
    delete without[key];
    expect(() => loadAccommodationsConfig(without)).toThrow();
  });

  it('loads secrets from *_FILE variables', () => {
    const urlFile = join(root, 'database-url.txt'); const keyFile = join(root, 'access-public.pem');
    writeFileSync(urlFile, `${validEnv.ACCOMMODATIONS_DATABASE_URL}\n`); writeFileSync(keyFile, publicKeyPem);
    const env: Record<string, string> = { ...validEnv, ACCOMMODATIONS_DATABASE_URL_FILE: urlFile, ACCOMMODATIONS_JWT_PUBLIC_KEY_FILE: keyFile };
    delete env.ACCOMMODATIONS_DATABASE_URL; delete env.ACCOMMODATIONS_JWT_PUBLIC_KEY;
    expect(loadAccommodationsConfig(env).databaseUrl).toBe(validEnv.ACCOMMODATIONS_DATABASE_URL);
    expect(() => loadAccommodationsConfig({ ...env, ACCOMMODATIONS_DATABASE_URL_FILE: join(root, 'missing.txt') })).toThrow('Invalid configuration: ACCOMMODATIONS_DATABASE_URL');
  });

  it('fixes the internal port to 3003', () => {
    for (const port of ['3002', '0', 'abc', '3003.5']) expect(() => loadAccommodationsConfig({ ...validEnv, ACCOMMODATIONS_PORT: port })).toThrow();
  });

  it.each([
    'postgresql://users:p@localhost/users_db',
    'postgresql://auth:p@localhost/auth_db',
    'http://u:p@localhost/accommodations_db',
    'postgresql://localhost/accommodations_db',
    'not a url',
  ])('rejects foreign or uncredentialed database %s', (url) => {
    expect(() => loadAccommodationsConfig({ ...validEnv, ACCOMMODATIONS_DATABASE_URL: url })).toThrow('Invalid configuration: ACCOMMODATIONS_DATABASE_URL');
  });

  it('rejects private, weak and non-RSA verification keys', () => {
    const weak = generateKeyPairSync('rsa', { modulusLength: 1024 }).publicKey.export({ type: 'spki', format: 'pem' }).toString();
    const ec = generateKeyPairSync('ec', { namedCurve: 'P-256' }).publicKey.export({ type: 'spki', format: 'pem' }).toString();
    const priv = accessKeys.privateKey.export({ type: 'pkcs8', format: 'pem' }).toString();
    for (const key of [weak, ec, priv, 'not a key']) {
      expect(() => loadAccommodationsConfig({ ...validEnv, ACCOMMODATIONS_JWT_PUBLIC_KEY: key })).toThrow('Invalid configuration: ACCOMMODATIONS_JWT_PUBLIC_KEY');
    }
  });

  it('accepts escaped newlines in an inline PEM', () => {
    expect(loadAccommodationsConfig({ ...validEnv, ACCOMMODATIONS_JWT_PUBLIC_KEY: publicKeyPem.replace(/\n/g, '\\n') }).jwt.publicKey).toContain('\n');
  });

  it('accepts a local JWKS containing the configured kid as an alternative to a PEM', () => {
    const env: Record<string, string> = { ...validEnv, ACCOMMODATIONS_JWT_JWKS: JSON.stringify({ keys: [jwk] }) };
    delete env.ACCOMMODATIONS_JWT_PUBLIC_KEY;
    expect(loadAccommodationsConfig(env).jwt.publicKey).toContain('BEGIN PUBLIC KEY');
  });

  it('rejects JWKS without the configured kid, malformed JWKS, or both key sources at once', () => {
    const base: Record<string, string> = { ...validEnv };
    delete base.ACCOMMODATIONS_JWT_PUBLIC_KEY;
    for (const jwks of [JSON.stringify({ keys: [{ ...jwk, kid: 'other' }] }), '{', JSON.stringify({ keys: [{ ...jwk, kty: 'EC' }] }), JSON.stringify({})]) {
      expect(() => loadAccommodationsConfig({ ...base, ACCOMMODATIONS_JWT_JWKS: jwks })).toThrow('Invalid configuration: ACCOMMODATIONS_JWT_JWKS');
    }
    expect(() => loadAccommodationsConfig({ ...validEnv, ACCOMMODATIONS_JWT_JWKS: JSON.stringify({ keys: [jwk] }) })).toThrow('Configure exactly one');
  });

  it('requires an absolute photo storage root and an http(s) OTLP endpoint', () => {
    expect(() => loadAccommodationsConfig({ ...validEnv, ACCOMMODATIONS_PHOTO_STORAGE_ROOT: 'relative/photos' })).toThrow('Invalid configuration: ACCOMMODATIONS_PHOTO_STORAGE_ROOT');
    expect(() => loadAccommodationsConfig({ ...validEnv, OTEL_EXPORTER_OTLP_ENDPOINT: 'ftp://collector' })).toThrow('Invalid configuration: OTEL_EXPORTER_OTLP_ENDPOINT');
  });

  it('enables development mode only for NODE_ENV=development', () => {
    expect(loadAccommodationsConfig({ ...validEnv, NODE_ENV: 'development' }).development).toBe(true);
    expect(loadAccommodationsConfig({ ...validEnv, NODE_ENV: 'production' }).development).toBe(false);
  });
});
