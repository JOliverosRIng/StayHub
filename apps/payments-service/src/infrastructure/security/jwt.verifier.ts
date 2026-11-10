import { UnauthorizedException } from '@nestjs/common';
import { decode, verify, type JwtPayload } from 'jsonwebtoken';
import type { JwtConfig } from '../config/payments-config';

function verifyJwt(token: string, config: JwtConfig, maxAgeSeconds: number, nowSeconds: number): JwtPayload {
  try {
    if (!token || !Number.isSafeInteger(maxAgeSeconds) || maxAgeSeconds <= 0 || !Number.isSafeInteger(nowSeconds)) {
      throw new Error();
    }
    const decoded = decode(token, { complete: true });
    if (!decoded || typeof decoded === 'string' || decoded.header.alg !== 'RS256' || decoded.header.kid !== config.kid) {
      throw new Error();
    }
    const verified = verify(token, config.publicKey, {
      algorithms: ['RS256'],
      issuer: config.issuer,
      audience: config.audience,
      maxAge: maxAgeSeconds,
      clockTimestamp: nowSeconds,
    });
    if (typeof verified === 'string') throw new Error();
    const issuedAt = verified.iat;
    const expiresAt = verified.exp;
    if (
      !Number.isInteger(issuedAt) ||
      !Number.isInteger(expiresAt) ||
      issuedAt! > nowSeconds ||
      expiresAt! <= nowSeconds ||
      expiresAt! <= issuedAt! ||
      expiresAt! - issuedAt! > maxAgeSeconds ||
      nowSeconds - issuedAt! > maxAgeSeconds
    ) {
      throw new Error();
    }
    return verified;
  } catch {
    throw new UnauthorizedException();
  }
}

export function verifyUserJwt(
  token: string,
  config: JwtConfig,
  maxAgeSeconds: number,
  nowSeconds: number = Math.floor(Date.now() / 1000),
): JwtPayload {
  return verifyJwt(token, config, maxAgeSeconds, nowSeconds);
}

export function verifyServiceJwt(
  token: string,
  config: JwtConfig,
  maxAgeSeconds: number,
  nowSeconds: number = Math.floor(Date.now() / 1000),
): JwtPayload {
  const payload = verifyJwt(token, config, maxAgeSeconds, nowSeconds);
  if (typeof payload.scope !== 'string') throw new UnauthorizedException();
  const scopes = payload.scope.split(' ');
  if (scopes.length === 0 || scopes.some((scope) => scope.length === 0) || new Set(scopes).size !== scopes.length) {
    throw new UnauthorizedException();
  }
  return payload;
}
