import { Inject, Injectable } from '@nestjs/common';
import { REVIEWS_CONFIG } from '@reviews/infrastructure/config/config.module';
import type { ReviewsConfig } from '@reviews/infrastructure/config/reviews-config';
import { verifyJwt, type AuthenticatedPrincipal } from './jwt-verifier';

@Injectable()
export class ServiceJwtVerifier {
  public constructor(@Inject(REVIEWS_CONFIG) private readonly config: ReviewsConfig) {}
  public verify(token: string): Promise<AuthenticatedPrincipal> {
    const scope = this.config.gatewayJwt.scope;
    if (!scope) throw new Error('Gateway JWT scope is not configured');
    return verifyJwt(token, this.config.gatewayJwt, { requireScope: scope, subjectKind: 'service' });
  }
}
