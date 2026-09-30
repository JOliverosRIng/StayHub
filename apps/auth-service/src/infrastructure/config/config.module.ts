import { Global, Module } from '@nestjs/common';

import { AUTH_CONFIG, loadAuthConfig } from './auth-config';

@Global()
@Module({
  providers: [{ provide: AUTH_CONFIG, useFactory: loadAuthConfig }],
  exports: [AUTH_CONFIG],
})
export class AuthConfigModule {}

