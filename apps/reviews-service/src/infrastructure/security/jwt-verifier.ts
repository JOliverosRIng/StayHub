import { UnauthorizedException } from '@nestjs/common';
import { importSPKI, jwtVerify, type JWTPayload } from 'jose';
import type { JwtVerificationConfig } from '@reviews/infrastructure/config/reviews-config';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;
export interface AuthenticatedPrincipal { sub: string; role?: string; scopes: readonly string[]; sid?: string; jti?: string; claims: JWTPayload; }

export async function verifyJwt(token: string, config: JwtVerificationConfig, options: { requireRole?: boolean; requireScope?: string } = {}): Promise<AuthenticatedPrincipal> {
  const headerPart = token.split('.')[0];
  if (!headerPart) throw new UnauthorizedException('Invalid bearer token');
  let header: { alg?: string; kid?: string };
  try { header = JSON.parse(Buffer.from(headerPart, 'base64url').toString('utf8')) as { alg?: string; kid?: string }; }
  catch { throw new UnauthorizedException('Invalid bearer token'); }
  if (header.alg !== 'RS256' || !header.kid) throw new UnauthorizedException('Unsupported token header');
  const pem = config.publicKeys[header.kid]; if (!pem) throw new UnauthorizedException('Unknown signing key');
  try {
    const key = await importSPKI(pem, 'RS256');
    const { payload } = await jwtVerify(token, key, { algorithms: ['RS256'], issuer: config.issuer, audience: config.audience, requiredClaims: ['sub', 'iat', 'exp'], clockTolerance: 5 });
    if (!payload.sub || !UUID.test(payload.sub) || typeof payload.iat !== 'number' || payload.iat > Math.floor(Date.now() / 1000) + 5) throw new Error('claims');
    if (payload.sid !== undefined && (typeof payload.sid !== 'string' || !UUID.test(payload.sid))) throw new Error('sid');
    if (payload.jti !== undefined && (typeof payload.jti !== 'string' || !UUID.test(payload.jti))) throw new Error('jti');
    const role = typeof payload.role === 'string' ? payload.role : undefined;
    if (options.requireRole && !role) throw new Error('role');
    const scopes = typeof payload.scope === 'string' ? payload.scope.split(/\s+/u).filter(Boolean) : [];
    if (options.requireScope && !scopes.includes(options.requireScope)) throw new Error('scope');
    return { sub: payload.sub, ...(role ? { role } : {}), scopes, ...(typeof payload.sid === 'string' ? { sid: payload.sid } : {}), ...(typeof payload.jti === 'string' ? { jti: payload.jti } : {}), claims: payload };
  } catch { throw new UnauthorizedException('Invalid bearer token'); }
}
