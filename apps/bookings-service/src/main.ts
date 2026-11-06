import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { BOOKINGS_CONFIG } from '@bookings/infrastructure/config/config.module';
import type { BookingsConfig } from '@bookings/infrastructure/config/bookings-config';
import { ClosedValidationPipe } from '@bookings/interfaces/http/validation.pipe';
import { ProblemDetailsFilter } from '@bookings/interfaces/http/problem.filter';
import { TraceInterceptor } from '@bookings/interfaces/http/trace.interceptor';
import { configureBookingsOpenApi } from '@bookings/interfaces/openapi/bookings.openapi';
import { BookingsLogger } from '@bookings/infrastructure/observability/bookings-logger';
import { startTelemetry, stopTelemetry } from '@bookings/infrastructure/observability/otel';
import { loadBookingsConfig } from '@bookings/infrastructure/config/bookings-config';

async function bootstrap(): Promise<void> { startTelemetry(loadBookingsConfig()); const app = await NestFactory.create(AppModule, { bufferLogs: true }); const config = app.get<BookingsConfig>(BOOKINGS_CONFIG); app.useLogger(app.get(BookingsLogger)); app.useGlobalPipes(new ClosedValidationPipe()); app.useGlobalFilters(new ProblemDetailsFilter()); app.useGlobalInterceptors(new TraceInterceptor()); configureBookingsOpenApi(app); app.enableShutdownHooks(); await app.listen(config.port, '0.0.0.0'); process.once('beforeExit', () => { void stopTelemetry(); }); }
void bootstrap();
