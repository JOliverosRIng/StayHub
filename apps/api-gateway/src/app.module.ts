import { Module } from '@nestjs/common';
import { APP_FILTER, APP_INTERCEPTOR, APP_PIPE } from '@nestjs/core';

import { GatewayRedisModule } from '@gateway/infrastructure/cache/gateway-redis.module';
import { GatewayConfigModule } from '@gateway/infrastructure/config/config.module';
import { IdentityHeaderInterceptor } from '@gateway/interfaces/http/security/identity-header.interceptor';
import { ProblemDetailsFilter } from '@gateway/interfaces/http/problem.filter';
import { TraceInterceptor } from '@gateway/interfaces/http/trace.interceptor';
import { GatewayValidationPipe } from '@gateway/interfaces/http/validation.pipe';
import { GatewayAuthModule } from '@gateway/modules/auth/gateway-auth.module';
import { HealthModule } from '@gateway/modules/health/health.module';

/**
 * GW-022 — Composición raíz del Gateway. Solo cablea piezas ya construidas (GW-009–GW-021):
 * configuración tipada, Redis de borde, autenticación JWT de usuario y sondas de salud; y
 * registra de forma global el filtro de Problem Details, el ValidationPipe con whitelist, el
 * interceptor de trazas y el stripping de cabeceras de identidad. No define lógica ni
 * endpoints de negocio: esos pertenecen a las historias US1–US4.
 *
 * Orden de interceptores: primero se eliminan las cabeceras de identidad aportadas por el
 * cliente y luego se establece/propaga el `traceId`.
 */
@Module({
  imports: [GatewayConfigModule, GatewayRedisModule, GatewayAuthModule, HealthModule],
  providers: [
    { provide: APP_FILTER, useClass: ProblemDetailsFilter },
    { provide: APP_PIPE, useClass: GatewayValidationPipe },
    { provide: APP_INTERCEPTOR, useClass: IdentityHeaderInterceptor },
    { provide: APP_INTERCEPTOR, useClass: TraceInterceptor },
  ],
})
export class AppModule {}
