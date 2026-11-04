import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { loadSearchConfig } from './infrastructure/config/search-config';
import { ProblemFilter } from './interfaces/http/problem.filter';
import { TraceInterceptor } from './interfaces/http/trace.interceptor';
import { createSearchValidationPipe } from './interfaces/http/validation.pipe';
import { createSearchOpenApi } from './interfaces/openapi/openapi.factory';
import { SwaggerModule } from '@nestjs/swagger';

async function bootstrap(): Promise<void> {
  const config = loadSearchConfig();
  const app = await NestFactory.create(AppModule, { bufferLogs: true });
  app.useGlobalFilters(new ProblemFilter()); app.useGlobalInterceptors(new TraceInterceptor()); app.useGlobalPipes(createSearchValidationPipe());
  SwaggerModule.setup('docs', app, createSearchOpenApi(app));
  app.enableShutdownHooks(); await app.listen(config.port, '0.0.0.0');
}
void bootstrap();
