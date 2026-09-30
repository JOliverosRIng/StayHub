import { UnauthorizedException } from '@nestjs/common';
import { decode, verify, type JwtPayload } from 'jsonwebtoken';
import type { JwtConfig } from '../config/users-config';
export function verifyJwt(token: string, config: JwtConfig, maxAge: number): JwtPayload {
  try {
    const decoded = decode(token, { complete: true });
    if (!decoded || decoded.header.alg !== 'RS256' || decoded.header.kid !== config.kid) throw new Error();
    const payload = verify(token, config.publicKey, { algorithms: ['RS256'], issuer: config.issuer, audience: config.audience, maxAge });
    if (typeof payload === 'string' || !Number.isInteger(payload.iat) || !Number.isInteger(payload.exp) || payload.iat! > Math.floor(Date.now() / 1000) || payload.exp! <= payload.iat! || payload.exp! - payload.iat! > maxAge) throw new Error();
    return payload;
  } catch { throw new UnauthorizedException(); }
}
