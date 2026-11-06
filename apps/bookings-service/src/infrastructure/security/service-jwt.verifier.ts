import { Inject, Injectable, UnauthorizedException } from '@nestjs/common';
import { importSPKI, jwtVerify, type JWTPayload } from 'jose';
import type { BookingsConfig } from '@bookings/infrastructure/config/bookings-config';
import { BOOKINGS_CONFIG } from '@bookings/infrastructure/config/config.module';

export interface ServicePrincipal { sub: string; role?: string; scopes: readonly string[]; claims: JWTPayload; }

@Injectable()
export class ServiceJwtVerifier {
  public constructor(@Inject(BOOKINGS_CONFIG) private readonly config: BookingsConfig) {}

  public async verify(token: string): Promise<ServicePrincipal> {
    const headerPart = token.split('.')[0];
    if (!headerPart) throw new UnauthorizedException('Invalid bearer token');
    let header: { alg?: string; kid?: string };
    try { header = JSON.parse(Buffer.from(headerPart, 'base64url').toString('utf8')) as { alg?: string; kid?: string }; }
    catch { throw new UnauthorizedException('Invalid bearer token'); }
    if (header.alg !== 'RS256' || !header.kid) throw new UnauthorizedException('Unsupported token header');
    const pem = this.config.jwtPublicKeys[header.kid];
    if (!pem) throw new UnauthorizedException('Unknown signing key');
    try {
      const key = await importSPKI(pem, 'RS256');
      const { payload } = await jwtVerify(token, key, {
        algorithms: ['RS256'], issuer: this.config.jwtIssuer, audience: this.config.jwtAudience,
        requiredClaims: ['sub', 'iat', 'exp'], clockTolerance: 5,
      });
      if (!payload.sub || typeof payload.iat !== 'number' || payload.iat > Math.floor(Date.now() / 1000) + 5) throw new Error('claims');
      const scopes = typeof payload.scope === 'string' ? payload.scope.split(/\s+/u).filter(Boolean) : [];
      if (!scopes.includes(this.config.jwtScope)) throw new Error('scope');
      return { sub: payload.sub, ...(typeof payload.role === 'string' ? { role: payload.role } : {}), scopes, claims: payload };
    } catch { throw new UnauthorizedException('Invalid bearer token'); }
  }
}
