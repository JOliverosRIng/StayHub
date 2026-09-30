import { Inject, Injectable } from '@nestjs/common';
import { decodeProtectedHeader, importSPKI, jwtVerify } from 'jose';

import { CLOCK, type Clock } from '@auth/application/ports/clock.port';
import { AUTH_CONFIG, type AuthConfig } from '@auth/infrastructure/config/auth-config';

export interface VerifiedServicePrincipal {
  readonly subject: string;
  readonly scope: string;
}

@Injectable()
export class ServiceJwtVerifier {
  public constructor(
    @Inject(AUTH_CONFIG) private readonly config: AuthConfig,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  public async verify(token: string): Promise<VerifiedServicePrincipal> {
    const header = decodeProtectedHeader(token);
    if (header.alg !== 'RS256' || typeof header.kid !== 'string') {
      throw new Error('Service token algorithm or kid is invalid');
    }
    const pem = this.config.inboundServiceJwt.publicKeys[header.kid];
    if (pem === undefined) {
      throw new Error('Service token kid is not allowed');
    }
    const key = await importSPKI(pem, 'RS256');
    const result = await jwtVerify(token, key, {
      algorithms: ['RS256'],
      issuer: this.config.inboundServiceJwt.issuer,
      audience: this.config.inboundServiceJwt.audience,
      currentDate: this.clock.now(),
      requiredClaims: ['sub', 'scope', 'iat', 'exp'],
    });
    const scope = result.payload.scope;
    if (typeof result.payload.sub !== 'string' || typeof scope !== 'string') {
      throw new Error('Service token claims are invalid');
    }
    const scopes = scope.split(' ');
    if (!scopes.includes(this.config.inboundServiceJwt.scope)) {
      throw new Error('Service token scope is insufficient');
    }
    return { subject: result.payload.sub, scope };
  }
}

