import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { PassportModule } from '@nestjs/passport';

import { JWT_VERIFIER } from '@gateway/application/ports/jwt-verifier.port';
import { GatewayRedisModule } from '@gateway/infrastructure/cache/gateway-redis.module';
import { GatewayConfigModule } from '@gateway/infrastructure/config/config.module';
import {
  GATEWAY_CONFIG,
  type GatewayConfig,
} from '@gateway/infrastructure/config/gateway-config';
import { AuthRegistrationClient } from '@gateway/infrastructure/http/auth-registration.client';
import { AuthSessionClient } from '@gateway/infrastructure/http/auth-session.client';
import { JwtVerifierService } from '@gateway/infrastructure/security/jwt-verifier.service';
import { ServiceTokenProvider } from '@gateway/infrastructure/service-auth/service-token.provider';
import { TrustedOriginService } from '@gateway/infrastructure/security/trusted-origin.service';
import { LoginRateLimitService } from '@gateway/modules/rate-limit/login-rate-limit.service';
import { RegistrationRateLimitService } from '@gateway/modules/rate-limit/registration-rate-limit.service';

import { AccessGuard, SESSION_INTROSPECTION } from './access.guard';
import { GatewayJwtStrategy } from './jwt.strategy';
import { LoginController } from './login.controller';
import { RefreshController } from './refresh.controller';
import { RefreshCookieService } from './refresh-cookie.service';
import { RegisterController } from './register.controller';
import { RolesGuard } from './roles.guard';
import { SessionIntrospectionService } from './session-introspection.service';
import { ValidateController } from './validate.controller';

/**
 * El orden de los `APP_GUARD` es significativo: Nest los ejecuta en el orden de registro, así que
 * `AccessGuard` (autenticación, 401) precede a `RolesGuard` (autorización, 403). Invertirlo
 * permitiría responder 403 a una petición no autenticada y rompería la precedencia de AGENT.md §4.4.
 */
@Module({
  imports: [GatewayConfigModule, GatewayRedisModule, PassportModule],
  controllers: [RegisterController, LoginController, RefreshController, ValidateController],
  providers: [
    JwtVerifierService,
    { provide: JWT_VERIFIER, useExisting: JwtVerifierService },
    GatewayJwtStrategy,
    ServiceTokenProvider,
    RefreshCookieService,
    {
      provide: TrustedOriginService,
      useFactory: (config: GatewayConfig): TrustedOriginService =>
        new TrustedOriginService(config.trustedProxyCidrs),
      inject: [GATEWAY_CONFIG],
    },
    RegistrationRateLimitService,
    LoginRateLimitService,
    {
      provide: AuthRegistrationClient,
      useFactory: (config: GatewayConfig, serviceToken: ServiceTokenProvider): AuthRegistrationClient =>
        new AuthRegistrationClient(config, serviceToken),
      inject: [GATEWAY_CONFIG, ServiceTokenProvider],
    },
    {
      provide: AuthSessionClient,
      useFactory: (config: GatewayConfig, serviceToken: ServiceTokenProvider): AuthSessionClient =>
        new AuthSessionClient(config, serviceToken),
      inject: [GATEWAY_CONFIG, ServiceTokenProvider],
    },
    {
      provide: SessionIntrospectionService,
      useFactory: (
        config: GatewayConfig,
        serviceToken: ServiceTokenProvider,
      ): SessionIntrospectionService => new SessionIntrospectionService(config, serviceToken),
      inject: [GATEWAY_CONFIG, ServiceTokenProvider],
    },
    { provide: SESSION_INTROSPECTION, useExisting: SessionIntrospectionService },
    { provide: APP_GUARD, useClass: AccessGuard },
    { provide: APP_GUARD, useClass: RolesGuard },
  ],
  exports: [JWT_VERIFIER, GatewayJwtStrategy, SESSION_INTROSPECTION],
})
export class GatewayAuthModule {}
