import { Inject, Injectable } from '@nestjs/common';
import { decodeProtectedHeader, importPKCS8, importSPKI, jwtVerify, SignJWT } from 'jose';

import { CLOCK, type Clock } from '@auth/application/ports/clock.port';
import type {
  AccessTokenClaims,
  TokenSigner,
  VerifiedAccessTokenClaims,
} from '@auth/application/ports/token-signer.port';
import { AUTH_CONFIG, type AuthConfig } from '@auth/infrastructure/config/auth-config';

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ROLES = ['GUEST', 'OWNER', 'ADMIN'] as const;

@Injectable()
export class Rs256TokenService implements TokenSigner {
  public constructor(
    @Inject(AUTH_CONFIG) private readonly config: AuthConfig,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  public async signAccessToken(claims: AccessTokenClaims): Promise<string> {
    const issuedAt = Math.floor(this.clock.now().getTime() / 1000);
    const privateKey = await importPKCS8(this.config.accessJwt.privateKey, 'RS256');
    return new SignJWT({ sid: claims.sid, role: claims.role })
      .setProtectedHeader({ alg: 'RS256', kid: this.config.accessJwt.activeKid, typ: 'JWT' })
      .setSubject(claims.sub)
      .setJti(claims.jti)
      .setIssuer(this.config.accessJwt.issuer)
      .setAudience(this.config.accessJwt.audience)
      .setIssuedAt(issuedAt)
      .setExpirationTime(issuedAt + this.config.accessTokenTtlSeconds)
      .sign(privateKey);
  }

  public async verifyAccessToken(token: string): Promise<VerifiedAccessTokenClaims> {
    const header = decodeProtectedHeader(token);
    if (header.alg !== 'RS256' || typeof header.kid !== 'string') {
      throw new Error('Access token algorithm or kid is invalid');
    }
    if (!Object.prototype.hasOwnProperty.call(this.config.accessJwt.publicKeys, header.kid)) {
      throw new Error('Access token kid is not allowed');
    }
    const pem = this.config.accessJwt.publicKeys[header.kid];
    if (pem === undefined) {
      throw new Error('Access token kid is not allowed');
    }
    const key = await importSPKI(pem, 'RS256');
    const result = await jwtVerify(token, key, {
      algorithms: ['RS256'],
      issuer: this.config.accessJwt.issuer,
      audience: this.config.accessJwt.audience,
      currentDate: this.clock.now(),
      requiredClaims: ['sub', 'sid', 'role', 'jti', 'iat', 'exp'],
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
    if (exp - iat !== this.config.accessTokenTtlSeconds) {
      throw new Error('Access token lifetime is invalid');
    }
    if (iat > Math.floor(this.clock.now().getTime() / 1000)) {
      throw new Error('Access token issued in the future');
    }
    return { sub, sid, jti, role: role as AccessTokenClaims['role'], iat, exp };
  }
}
