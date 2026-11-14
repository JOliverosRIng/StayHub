import { randomUUID } from 'node:crypto';

import { Inject, Injectable } from '@nestjs/common';
import { importPKCS8, SignJWT } from 'jose';

import {
  GATEWAY_CONFIG,
  type GatewayConfig,
  type ServiceJwtConfig,
} from '@gateway/infrastructure/config/gateway-config';

const SERVICE_SUBJECT = 'api-gateway';

@Injectable()
export class ServiceTokenProvider {
  public constructor(@Inject(GATEWAY_CONFIG) private readonly config: GatewayConfig) {}

  public async issue(): Promise<string> {
    return issueServiceToken(this.config.serviceJwt);
  }
}

/** Emite un JWT interno para un destino concreto usando la identidad criptográfica del Gateway. */
export async function issueServiceToken(settings: ServiceJwtConfig): Promise<string> {
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

@Injectable()
export class ReviewsServiceTokenProvider {
  public constructor(@Inject(GATEWAY_CONFIG) private readonly config: GatewayConfig) {}

  public issue(): Promise<string> {
    return issueServiceToken({
      ...this.config.serviceJwt,
      audience: this.config.reviewsServiceJwt.audience,
      scope: this.config.reviewsServiceJwt.scope,
    });
  }
}

/** Service JWT Gateway→Search: mismo emisor y clave del Gateway, audience/scope propios de Search. */
@Injectable()
export class SearchServiceTokenProvider {
  public constructor(@Inject(GATEWAY_CONFIG) private readonly config: GatewayConfig) {}

  public issue(): Promise<string> {
    return issueServiceToken({
      ...this.config.serviceJwt,
      audience: this.config.searchServiceJwt.audience,
      scope: this.config.searchServiceJwt.scope,
    });
  }
}
