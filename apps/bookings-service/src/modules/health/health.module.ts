import { Module } from '@nestjs/common';
import { BookingsModule } from '@bookings/modules/bookings/bookings.module';
import { HealthController } from './health.controller';

@Module({ imports: [BookingsModule], controllers: [HealthController] })
export class HealthModule {}
