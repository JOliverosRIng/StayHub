import { Inject, Injectable } from '@nestjs/common';
import { decodeProtectedHeader, importSPKI, jwtVerify } from 'jose';

import { GATEWAY_CONFIG, type GatewayConfig } from '@gateway/infrastructure/config/gateway-config';
import type {
  AccessTokenVerifier,
  UserRole,
  VerifiedUserClaims,
} from '@gateway/application/ports/jwt-verifier.port';

export type { UserRole, VerifiedUserClaims } from '@gateway/application/ports/jwt-verifier.port';

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ROLES = ['GUEST', 'OWNER', 'ADMIN'] as const;
const REQUIRED_CLAIMS = ['sub', 'sid', 'role', 'jti', 'iat', 'exp'] as const;

@Injectable()
export class JwtVerifierService implements AccessTokenVerifier {
  public constructor(@Inject(GATEWAY_CONFIG) private readonly config: GatewayConfig) {}

  public async verify(token: string): Promise<VerifiedUserClaims> {
    const header = decodeProtectedHeader(token);
    if (header.alg !== 'RS256' || typeof header.kid !== 'string') {
      throw new Error('Access token algorithm or kid is invalid');
    }
    if (!Object.prototype.hasOwnProperty.call(this.config.userJwt.publicKeys, header.kid)) {
      throw new Error('Access token kid is not allowed');
    }
    const pem = this.config.userJwt.publicKeys[header.kid];
    if (pem === undefined) {
      throw new Error('Access token kid is not allowed');
    }

    const result = await jwtVerify(token, await importSPKI(pem, 'RS256'), {
      algorithms: ['RS256'],
      issuer: this.config.userJwt.issuer,
      audience: this.config.userJwt.audience,
      requiredClaims: [...REQUIRED_CLAIMS],
    });

    const { sub, sid, role, jti, iat, exp } = result.payload;
    if (
      typeof sub !== 'string' ||
      !UUID_PATTERN.test(sub) ||
      typeof sid !== 'string' ||
      !UUID_PATTERN.test(sid) ||
      typeof jti !== 'string' ||
      !UUID_PATTERN.test(jti) ||
      !ROLES.includes(role as (typeof ROLES)[number])
    ) {
      throw new Error('Access token claims are invalid');
    }
    if (typeof iat !== 'number' || typeof exp !== 'number') {
      throw new Error('Access token timestamps are invalid');
    }
    if (exp <= iat) {
      throw new Error('Access token lifetime is invalid');
    }
    if (iat > Math.floor(Date.now() / 1000) + 60) {
      throw new Error('Access token issued in the future');
    }
    return { sub, sid, role: role as UserRole, jti, iat, exp };
  }
}
