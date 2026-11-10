import { Inject, Injectable } from '@nestjs/common';
import { REVIEWS_CONFIG } from '@reviews/infrastructure/config/config.module';
import type { ReviewsConfig } from '@reviews/infrastructure/config/reviews-config';
import { verifyJwt, type AuthenticatedPrincipal } from './jwt-verifier';

@Injectable()
export class UserJwtVerifier {
  public constructor(@Inject(REVIEWS_CONFIG) private readonly config: ReviewsConfig) {}
  public verify(token: string): Promise<AuthenticatedPrincipal> { return verifyJwt(token, this.config.userJwt, { requireRole: true }); }
}
