import type { INestApplication, ModuleMetadata, Provider, Type } from '@nestjs/common';
import { Test } from '@nestjs/testing';

import { AUTH_CONFIG } from '@auth/infrastructure/config/auth-config';
import { AuthLogger } from '@auth/infrastructure/observability/auth-logger';
import { configureAuthHttp } from '@auth/interfaces/http/configure-auth-http';
import { TraceInterceptor } from '@auth/interfaces/http/trace.interceptor';
import { AuthConfigModule } from '@auth/infrastructure/config/config.module';
import { createAuthCryptoFixture, type AuthCryptoFixture } from './crypto-fixture';

export interface AuthTestAppOptions {
  readonly imports?: ModuleMetadata['imports'];
  readonly providers?: readonly Provider[];
  readonly controllers?: readonly Type<unknown>[];
  readonly fixture?: AuthCryptoFixture;
  readonly swagger?: boolean;
}

export interface AuthTestApp {
  readonly app: INestApplication;
  readonly fixture: AuthCryptoFixture;
  close(): Promise<void>;
}

export async function createAuthTestApp(options: AuthTestAppOptions = {}): Promise<AuthTestApp> {
  const fixture = options.fixture ?? createAuthCryptoFixture();
  const builder = Test.createTestingModule({
    imports: [AuthConfigModule, ...(options.imports ?? [])],
    providers: [AuthLogger, TraceInterceptor, ...(options.providers ?? [])],
    controllers: [...(options.controllers ?? [])],
  });
  builder.overrideProvider(AUTH_CONFIG).useValue(fixture.config);
  const moduleRef = await builder.compile();
  const app = moduleRef.createNestApplication({ logger: false });
  configureAuthHttp(app, { swagger: options.swagger ?? false });
  await app.init();
  return {
    app,
    fixture,
    close: async (): Promise<void> => {
      await app.close();
    },
  };
}
