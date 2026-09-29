import { Module } from '@nestjs/common';
import { PassportModule } from '@nestjs/passport';

import { JWT_VERIFIER } from '@gateway/application/ports/jwt-verifier.port';
import { GatewayConfigModule } from '@gateway/infrastructure/config/config.module';
import { JwtVerifierService } from '@gateway/infrastructure/security/jwt-verifier.service';

import { GatewayJwtStrategy } from './jwt.strategy';

@Module({
  imports: [GatewayConfigModule, PassportModule],
  providers: [
    JwtVerifierService,
    { provide: JWT_VERIFIER, useExisting: JwtVerifierService },
    GatewayJwtStrategy,
  ],
  exports: [JWT_VERIFIER, GatewayJwtStrategy],
})
export class GatewayAuthModule {}
