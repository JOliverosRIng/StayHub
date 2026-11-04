import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { AppModule } from '../../src/app.module';
import { configureSearchHttp } from '../../src/interfaces/http/configure-search-http';
import { SearchLogger } from '../../src/infrastructure/observability/search-logger';
import { RABBITMQ_CONNECTOR } from '../../src/infrastructure/messaging/rabbitmq-projection.consumer';
export async function createSearchTestApp(): Promise<INestApplication> {
  const module = await Test.createTestingModule({ imports: [AppModule] })
    .overrideProvider(RABBITMQ_CONNECTOR)
    .useValue(() => Promise.reject(new Error('RabbitMQ intentionally offline')))
    .compile();
  const app = module.createNestApplication();
  const logger = new SearchLogger(); logger.setLevel('error');
  configureSearchHttp(app, logger);
  await app.init(); return app;
}
