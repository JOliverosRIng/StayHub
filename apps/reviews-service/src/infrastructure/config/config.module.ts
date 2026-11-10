import { Global, Module } from '@nestjs/common';
import { loadReviewsConfig } from './reviews-config';
export const REVIEWS_CONFIG = Symbol('REVIEWS_CONFIG');
@Global()
@Module({ providers: [{ provide: REVIEWS_CONFIG, useFactory: loadReviewsConfig }], exports: [REVIEWS_CONFIG] })
export class ReviewsConfigModule {}
