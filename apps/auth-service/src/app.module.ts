import { Module } from '@nestjs/common';

import { AuthRedisModule } from '@auth/infrastructure/cache/auth-redis.module';
import { PrismaModule } from '@auth/infrastructure/persistence/prisma/prisma.module';
import { TraceInterceptor } from '@auth/interfaces/http/trace.interceptor';
import { OpenApiModule } from '@auth/interfaces/openapi/openapi.module';
import { CoreModule } from '@auth/modules/core/core.module';
import { HealthModule } from '@auth/modules/health/health.module';
import { LoginModule } from '@auth/modules/login/login.module';
import { RegistrationModule } from '@auth/modules/registration/registration.module';
import { ServiceAuthModule } from '@auth/modules/service-auth/service-auth.module';
import { SessionsModule } from '@auth/modules/sessions/sessions.module';
import { TokensModule } from '@auth/modules/tokens/tokens.module';

@Module({
  imports: [
    CoreModule,
    ServiceAuthModule,
    PrismaModule,
    AuthRedisModule,
    OpenApiModule,
    HealthModule,
    TokensModule,
    SessionsModule,
    LoginModule,
    RegistrationModule,
  ],
  providers: [TraceInterceptor],
  exports: [CoreModule, ServiceAuthModule],
})
export class AppModule {}
