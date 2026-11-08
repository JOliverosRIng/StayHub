import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { PAYMENTS_CONFIG, type PaymentsConfig } from './infrastructure/config/payments-config';
import { configureHttp } from './interfaces/http/configure-http';
import { PaymentsLogger } from './infrastructure/logging/payments-logger';
import { startTelemetry } from './infrastructure/observability/otel';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule, { bodyParser: false });
  app.useLogger(app.get(PaymentsLogger));
  configureHttp(app);
  app.enableShutdownHooks();
  const config = app.get<PaymentsConfig>(PAYMENTS_CONFIG);
  startTelemetry(config);
  await app.listen(config.port, '0.0.0.0');
}

void bootstrap();
