import { randomUUID } from 'node:crypto';

import { Inject, Injectable } from '@nestjs/common';
import { importPKCS8, SignJWT } from 'jose';

import { GATEWAY_CONFIG, type GatewayConfig } from '@gateway/infrastructure/config/gateway-config';

const SERVICE_SUBJECT = 'api-gateway';

@Injectable()
export class ServiceTokenProvider {
  public constructor(@Inject(GATEWAY_CONFIG) private readonly config: GatewayConfig) {}

  public async issue(): Promise<string> {
    const settings = this.config.serviceJwt;
    const key = await importPKCS8(settings.privateKey, 'RS256');
    const issuedAt = Math.floor(Date.now() / 1000);

    return new SignJWT({ scope: settings.scope })
      .setProtectedHeader({ alg: 'RS256', kid: settings.kid, typ: 'JWT' })
      .setSubject(SERVICE_SUBJECT)
      .setIssuer(settings.issuer)
      .setAudience(settings.audience)
      .setJti(randomUUID())
      .setIssuedAt(issuedAt)
      .setExpirationTime(issuedAt + settings.ttlSeconds)
      .sign(key);
  }
}
