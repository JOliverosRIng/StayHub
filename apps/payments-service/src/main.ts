import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { PAYMENTS_CONFIG, type PaymentsConfig } from './infrastructure/config/payments-config';
import { configureHttp } from './interfaces/http/configure-http';
import { PaymentsLogger } from './infrastructure/logging/payments-logger';
import { startTelemetry } from './infrastructure/observability/otel';
import { SwaggerModule } from '@nestjs/swagger';
import { createPaymentsOpenApi } from './interfaces/openapi/openapi.factory';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule, { bodyParser: false });
  app.useLogger(app.get(PaymentsLogger));
  configureHttp(app);
  if (process.env.NODE_ENV === 'development') {
    const document = createPaymentsOpenApi(app);
    document.servers = [{ url: '/', description: 'Servicio local' }];
    SwaggerModule.setup('docs', app, document);
  }
  app.enableShutdownHooks();
  const config = app.get<PaymentsConfig>(PAYMENTS_CONFIG);
  startTelemetry(config);
  await app.listen(config.port, '0.0.0.0');
}

void bootstrap();
