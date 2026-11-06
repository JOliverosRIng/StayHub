import { Module } from '@nestjs/common';
import { BookingsConfigModule } from '@bookings/infrastructure/config/config.module';
import { PrismaModule } from '@bookings/infrastructure/persistence/prisma/prisma.module';
import { HealthModule } from '@bookings/modules/health/health.module';
import { BookingsModule } from '@bookings/modules/bookings/bookings.module';
import { BookingsLogger } from '@bookings/infrastructure/observability/bookings-logger';
import { BookingsMetrics } from '@bookings/infrastructure/observability/bookings-metrics';

@Module({ imports: [BookingsConfigModule, PrismaModule, HealthModule, BookingsModule], providers: [BookingsLogger, BookingsMetrics] })
export class AppModule {}
