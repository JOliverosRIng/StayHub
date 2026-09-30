import { Module } from '@nestjs/common';
import { PassportModule } from '@nestjs/passport';

import { JWT_VERIFIER } from '@gateway/application/ports/jwt-verifier.port';
import { GatewayRedisModule } from '@gateway/infrastructure/cache/gateway-redis.module';
import { GatewayConfigModule } from '@gateway/infrastructure/config/config.module';
import {
  GATEWAY_CONFIG,
  type GatewayConfig,
} from '@gateway/infrastructure/config/gateway-config';
import { AuthRegistrationClient } from '@gateway/infrastructure/http/auth-registration.client';
import { JwtVerifierService } from '@gateway/infrastructure/security/jwt-verifier.service';
import { ServiceTokenProvider } from '@gateway/infrastructure/service-auth/service-token.provider';
import { TrustedOriginService } from '@gateway/infrastructure/security/trusted-origin.service';
import { RegistrationRateLimitService } from '@gateway/modules/rate-limit/registration-rate-limit.service';

import { GatewayJwtStrategy } from './jwt.strategy';
import { RegisterController } from './register.controller';

@Module({
  imports: [GatewayConfigModule, GatewayRedisModule, PassportModule],
  controllers: [RegisterController],
  providers: [
    JwtVerifierService,
    { provide: JWT_VERIFIER, useExisting: JwtVerifierService },
    GatewayJwtStrategy,
    ServiceTokenProvider,
    {
      provide: TrustedOriginService,
      useFactory: (config: GatewayConfig): TrustedOriginService =>
        new TrustedOriginService(config.trustedProxyCidrs),
      inject: [GATEWAY_CONFIG],
    },
    RegistrationRateLimitService,
    {
      provide: AuthRegistrationClient,
      useFactory: (config: GatewayConfig, serviceToken: ServiceTokenProvider): AuthRegistrationClient =>
        new AuthRegistrationClient(config, serviceToken),
      inject: [GATEWAY_CONFIG, ServiceTokenProvider],
    },
  ],
  exports: [JWT_VERIFIER, GatewayJwtStrategy],
})
export class GatewayAuthModule {}
