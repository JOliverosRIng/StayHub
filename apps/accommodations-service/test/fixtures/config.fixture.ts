import { generateKeyPairSync, randomUUID } from 'node:crypto';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { sign, type SignOptions } from 'jsonwebtoken';
import type { AccommodationsConfig } from '../../src/infrastructure/config/accommodations-config';

export const accessKeys = generateKeyPairSync('rsa', { modulusLength: 2048 });
export const publicKeyPem = accessKeys.publicKey.export({ type: 'spki', format: 'pem' }).toString();
export const TEST_ISSUER = 'test-auth';
export const TEST_AUDIENCE = 'test-api';
export const TEST_KID = 'access-v1';
export const SYNTHETIC_DATABASE_URL = 'postgresql://accommodations:synthetic@localhost:5432/accommodations_db';

export function storageRoot(): string {
  return mkdtempSync(join(tmpdir(), 'accommodations-photos-'));
}

export function testConfig(databaseUrl = SYNTHETIC_DATABASE_URL, photoStorageRoot = storageRoot()): AccommodationsConfig {
  return {
    port: 3003, databaseUrl, photoStorageRoot, otlpEndpoint: 'http://localhost:4318', development: false,
    jwt: { issuer: TEST_ISSUER, audience: TEST_AUDIENCE, kid: TEST_KID, publicKey: publicKeyPem },
  };
}

export type Role = 'GUEST' | 'OWNER' | 'ADMIN';

export function token(sub: string = randomUUID(), role: Role = 'OWNER', claims: Record<string, unknown> = {}, options: SignOptions = {}): string {
  const now = Math.floor(Date.now() / 1000);
  return sign({ sub, role, iss: TEST_ISSUER, aud: TEST_AUDIENCE, iat: now, exp: now + 3600, ...claims }, accessKeys.privateKey, { algorithm: 'RS256', keyid: TEST_KID, ...options });
}

export function bearer(sub?: string, role: Role = 'OWNER'): string {
  return `Bearer ${token(sub, role)}`;
}
