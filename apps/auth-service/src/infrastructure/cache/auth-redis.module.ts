import { Global, Module } from '@nestjs/common';

import { AUTH_CACHE } from '@auth/application/ports/cache.port';
import { AuthCacheAdapter } from './auth-cache.adapter';

@Global()
@Module({
  providers: [AuthCacheAdapter, { provide: AUTH_CACHE, useExisting: AuthCacheAdapter }],
  exports: [AUTH_CACHE, AuthCacheAdapter],
})
export class AuthRedisModule {}

