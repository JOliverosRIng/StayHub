import { Module } from '@nestjs/common';
import { ReviewsConfigModule } from '@reviews/infrastructure/config/config.module';
import { PrismaModule } from '@reviews/infrastructure/persistence/prisma/prisma.module';
import { HealthModule } from '@reviews/modules/health/health.module';
import { ReviewsModule } from '@reviews/modules/reviews/reviews.module';
import { ReviewsSharedModule } from '@reviews/modules/shared/reviews-shared.module';

@Module({
  imports: [ReviewsConfigModule, PrismaModule, ReviewsSharedModule, HealthModule, ReviewsModule],
})
export class AppModule {}
