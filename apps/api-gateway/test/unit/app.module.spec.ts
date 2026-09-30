import { APP_FILTER, APP_INTERCEPTOR, APP_PIPE } from '@nestjs/core';
import { Test } from '@nestjs/testing';

import { GatewayRedisService } from '@gateway/infrastructure/cache/gateway-redis.service';
import { GatewayRedisModule } from '@gateway/infrastructure/cache/gateway-redis.module';
import { GatewayConfigModule } from '@gateway/infrastructure/config/config.module';
import { GATEWAY_CONFIG } from '@gateway/infrastructure/config/gateway-config';
import { IdentityHeaderInterceptor } from '@gateway/interfaces/http/security/identity-header.interceptor';
import { ProblemDetailsFilter } from '@gateway/interfaces/http/problem.filter';
import { TraceInterceptor } from '@gateway/interfaces/http/trace.interceptor';
import { GatewayValidationPipe } from '@gateway/interfaces/http/validation.pipe';
import { GatewayAuthModule } from '@gateway/modules/auth/gateway-auth.module';
import { GatewayJwtStrategy } from '@gateway/modules/auth/jwt.strategy';
import { HealthController } from '@gateway/modules/health/health.controller';
import { HealthModule } from '@gateway/modules/health/health.module';

import { AppModule } from '../../src/app.module';
import { createTestGatewayConfig } from '../support/gateway-config-fixture';

interface ClassProvider {
  readonly provide: unknown;
  readonly useClass: unknown;
}

function metadata(key: string): unknown[] {
  return (Reflect.getMetadata(key, AppModule) as unknown[] | undefined) ?? [];
}

function isClassProvider(value: unknown): value is ClassProvider {
  return typeof value === 'object' && value !== null && 'provide' in value && 'useClass' in value;
}

function registersGlobal(token: unknown, useClass: unknown): boolean {
  return metadata('providers').some(
    (provider) =>
      isClassProvider(provider) && provider.provide === token && provider.useClass === useClass,
  );
}

describe('AppModule (GW-022)', () => {
  describe('cableado estructural', () => {
    it('importa config, Redis de borde, auth JWT y health ya construidos', () => {
      const imports = metadata('imports');
      expect(imports).toEqual(
        expect.arrayContaining([
          GatewayConfigModule,
          GatewayRedisModule,
          GatewayAuthModule,
          HealthModule,
        ]),
      );
    });

    it('registra globalmente el filtro de Problem Details', () => {
      expect(registersGlobal(APP_FILTER, ProblemDetailsFilter)).toBe(true);
    });

    it('registra globalmente el ValidationPipe con whitelist', () => {
      expect(registersGlobal(APP_PIPE, GatewayValidationPipe)).toBe(true);
    });

    it('registra globalmente el interceptor de trazas y el stripping de identidad', () => {
      expect(registersGlobal(APP_INTERCEPTOR, TraceInterceptor)).toBe(true);
      expect(registersGlobal(APP_INTERCEPTOR, IdentityHeaderInterceptor)).toBe(true);
    });

    it('no declara controladores de negocio propios (eso son US1-US4)', () => {
      expect(metadata('controllers')).toEqual([]);
    });
  });

  describe('compilación con configuración real', () => {
    const originalEnv = process.env;

    afterEach(() => {
      process.env = originalEnv;
    });

    it('resuelve las piezas montadas: config, Redis, estrategia JWT y health', async () => {
      const { env } = createTestGatewayConfig();
      process.env = { ...originalEnv, ...env };

      const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();

      expect(moduleRef.get(GATEWAY_CONFIG, { strict: false })).toBeDefined();
      expect(moduleRef.get(GatewayRedisService, { strict: false })).toBeInstanceOf(
        GatewayRedisService,
      );
      expect(moduleRef.get(GatewayJwtStrategy, { strict: false })).toBeInstanceOf(
        GatewayJwtStrategy,
      );
      expect(moduleRef.get(HealthController, { strict: false })).toBeInstanceOf(HealthController);

      await moduleRef.close();
    });
  });
});
