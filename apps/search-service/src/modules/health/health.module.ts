import { Global, Module } from '@nestjs/common';
import { HealthController } from './health.controller';
import { RabbitMqHealth } from '@search/infrastructure/health/rabbitmq-health';
import { ShutdownState } from '@search/infrastructure/lifecycle/shutdown-state';
@Global()
@Module({ controllers: [HealthController], providers: [RabbitMqHealth, ShutdownState], exports: [ShutdownState] })
export class HealthModule {}
