import { Inject, Injectable } from '@nestjs/common';
import { importPKCS8, SignJWT } from 'jose';

import { CLOCK, type Clock } from '@auth/application/ports/clock.port';
import { UUID_GENERATOR, type UuidGenerator } from '@auth/application/ports/random.port';
import { AUTH_CONFIG, type AuthConfig } from '@auth/infrastructure/config/auth-config';

@Injectable()
export class UsersServiceTokenProvider {
  public constructor(
    @Inject(AUTH_CONFIG) private readonly config: AuthConfig,
    @Inject(CLOCK) private readonly clock: Clock,
    @Inject(UUID_GENERATOR) private readonly uuids: UuidGenerator,
  ) {}

  public async issue(): Promise<string> {
    const issuedAt = Math.floor(this.clock.now().getTime() / 1000);
    const settings = this.config.outboundServiceJwt;
    const key = await importPKCS8(settings.privateKey, 'RS256');
    return new SignJWT({ scope: settings.scope })
      .setProtectedHeader({ alg: 'RS256', kid: settings.kid, typ: 'JWT' })
      .setSubject('auth-service')
      .setIssuer(settings.issuer)
      .setAudience(settings.audience)
      .setJti(this.uuids.generate())
      .setIssuedAt(issuedAt)
      .setExpirationTime(issuedAt + settings.ttlSeconds)
      .sign(key);
  }
}

