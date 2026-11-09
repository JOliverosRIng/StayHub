import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { REVIEWS_CONFIG } from '@reviews/infrastructure/config/config.module';
import type { ReviewsConfig } from '@reviews/infrastructure/config/reviews-config';
import { registerGracefulShutdown } from '@reviews/infrastructure/lifecycle/graceful-shutdown';
import { startTelemetry, stopTelemetry } from '@reviews/infrastructure/observability/otel';
import { configureReviewsOpenApi } from '@reviews/interfaces/openapi/reviews.openapi';
import { ClosedValidationPipe } from '@reviews/interfaces/http/validation.pipe';
import { ProblemDetailsFilter } from '@reviews/interfaces/http/problem.filter';
import { TraceInterceptor } from '@reviews/interfaces/http/trace.interceptor';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule, { bufferLogs: true });
  const config = app.get<ReviewsConfig>(REVIEWS_CONFIG);
  startTelemetry(config.otlpEndpoint);
  app.useGlobalPipes(new ClosedValidationPipe());
  app.useGlobalFilters(new ProblemDetailsFilter());
  app.useGlobalInterceptors(new TraceInterceptor());
  app.enableShutdownHooks();
  configureReviewsOpenApi(app);
  registerGracefulShutdown(
    {
      close: async () => {
        await app.close();
        await stopTelemetry();
      },
    },
    config.shutdownGraceMs,
  );
  await app.listen(config.port, '0.0.0.0');
  process.once('beforeExit', () => {
    void stopTelemetry();
  });
}
void bootstrap();
