import { decode, verify } from 'jsonwebtoken';
import type { ServiceJwtConfig } from '../config/accommodations-config';

export class InvalidServiceTokenError extends Error {
  constructor() { super('INVALID_SERVICE_TOKEN'); }
}

export interface ServicePrincipal {
  sub: string;
  scopes: readonly string[];
}

const MAX_AGE_SECONDS = 300;

/** Fail-closed RS256 service-token verification with exact issuer/audience/kid and required scope. */
export function verifyServiceToken(
  token: string,
  config: ServiceJwtConfig,
  now: number = Math.floor(Date.now() / 1000),
): ServicePrincipal {
  let claims: Record<string, unknown>;
  try {
    const decoded = decode(token, { complete: true });
    if (!decoded || decoded.header.alg !== 'RS256' || decoded.header.kid !== config.kid) throw new Error();
    const verified = verify(token, config.publicKey, {
      algorithms: ['RS256'],
      issuer: config.issuer,
      audience: config.audience,
      clockTimestamp: now,
    });
    if (typeof verified === 'string') throw new Error();
    claims = verified as Record<string, unknown>;
  } catch {
    throw new InvalidServiceTokenError();
  }

  const { iat, exp, sub, scope } = claims;
  if (
    typeof iat !== 'number' || typeof exp !== 'number' ||
    !Number.isInteger(iat) || !Number.isInteger(exp) ||
    iat > now || exp <= now || exp <= iat || now - iat > MAX_AGE_SECONDS
  ) {
    throw new InvalidServiceTokenError();
  }
  if (typeof sub !== 'string' || sub.trim().length === 0 || typeof scope !== 'string') throw new InvalidServiceTokenError();
  const scopes = scope.split(/\s+/u).filter(Boolean);
  if (!scopes.includes(config.scope)) throw new InvalidServiceTokenError();
  return { sub, scopes };
}
