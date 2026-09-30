import 'reflect-metadata';

import { readFileSync } from 'node:fs';

import { Logger, type INestApplication, type Type } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';

import { AppModule } from './app.module';
import { loadGatewayConfig, type GatewayConfig } from './infrastructure/config/gateway-config';

export interface GatewayHttpsOptions {
  readonly cert: Buffer;
  readonly key: Buffer;
  readonly minVersion: 'TLSv1.2' | 'TLSv1.3';
}

export function httpsOptionsFrom(config: GatewayConfig): GatewayHttpsOptions {
  return {
    cert: readFileSync(config.tls.certFile),
    key: readFileSync(config.tls.keyFile),
    minVersion: config.tls.minVersion,
  };
}

export async function createGatewayApp(
  config: GatewayConfig = loadGatewayConfig(),
  rootModule: Type<unknown> = AppModule,
): Promise<INestApplication> {
  const app = await NestFactory.create(rootModule, {
    bufferLogs: true,
    httpsOptions: httpsOptionsFrom(config),
  });
  app.setGlobalPrefix(config.apiPrefix);
  return app;
}

export async function startGateway(
  config: GatewayConfig = loadGatewayConfig(),
  rootModule: Type<unknown> = AppModule,
): Promise<INestApplication> {
  const app = await createGatewayApp(config, rootModule);
  await app.listen(config.port);
  return app;
}

if (require.main === module) {
  void startGateway().catch((error: unknown) => {
    new Logger('Bootstrap').error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  });
}
