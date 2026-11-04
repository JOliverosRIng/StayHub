import { decode, verify } from 'jsonwebtoken';
import type { JwtConfig } from '../config/accommodations-config';
import type { Principal, Role } from '@accommodations/domain/properties/property.types';
import { UUID_PATTERN } from '@accommodations/domain/shared/uuid';

const ROLES: readonly string[] = ['GUEST', 'OWNER', 'ADMIN'] satisfies Role[];

export class InvalidAccessTokenError extends Error {
  constructor() { super('INVALID_ACCESS_TOKEN'); }
}

/** Fail-closed RS256 verification: any doubt about header, signature or claims yields InvalidAccessTokenError without detail. */
export function verifyAccessToken(token: string, config: JwtConfig, now: number = Math.floor(Date.now() / 1000)): Principal {
  let claims: Record<string, unknown>;
  try {
    const decoded = decode(token, { complete: true });
    if (!decoded || decoded.header.alg !== 'RS256' || typeof decoded.header.kid !== 'string' || decoded.header.kid !== config.kid) throw new Error();
    const verified = verify(token, config.publicKey, { algorithms: ['RS256'], issuer: config.issuer, audience: config.audience, clockTimestamp: now });
    if (typeof verified === 'string') throw new Error();
    claims = verified as Record<string, unknown>;
  } catch {
    throw new InvalidAccessTokenError();
  }
  const { iat, exp, sub, role } = claims;
  if (typeof iat !== 'number' || typeof exp !== 'number' || !Number.isInteger(iat) || !Number.isInteger(exp) || iat > now || exp <= now || exp <= iat) throw new InvalidAccessTokenError();
  if (typeof sub !== 'string' || !UUID_PATTERN.test(sub) || typeof role !== 'string' || !ROLES.includes(role)) throw new InvalidAccessTokenError();
  return { sub, role: role as Role };
}
