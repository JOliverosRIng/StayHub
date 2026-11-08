import { Module } from '@nestjs/common';
import { HealthController } from './health.controller';
import { OutboxModule } from '../outbox.module';

@Module({ imports: [OutboxModule], controllers: [HealthController] })
export class HealthModule {}
