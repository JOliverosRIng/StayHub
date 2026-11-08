import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { PAYMENTS_CONFIG, type PaymentsConfig } from './infrastructure/config/payments-config';
import { configureHttp } from './interfaces/http/configure-http';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule, { bodyParser: false });
  configureHttp(app);
  app.enableShutdownHooks();
  const config = app.get<PaymentsConfig>(PAYMENTS_CONFIG);
  await app.listen(config.port, '0.0.0.0');
}

void bootstrap();
