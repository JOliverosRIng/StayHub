import 'reflect-metadata';

import { NestFactory } from '@nestjs/core';
import type { INestApplication } from '@nestjs/common';

import { AppModule } from './app.module';

export function createGatewayApp(): Promise<INestApplication> {
  return NestFactory.create(AppModule, { bufferLogs: true });
}

async function bootstrap(): Promise<void> {
  const app = await createGatewayApp();
  await app.init();
}

void bootstrap();
