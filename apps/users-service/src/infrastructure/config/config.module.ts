import { Global, Module } from '@nestjs/common';

import { USERS_CONFIG, loadUsersConfig } from './users-config';

@Global()
@Module({
  providers: [{ provide: USERS_CONFIG, useFactory: (): ReturnType<typeof loadUsersConfig> => loadUsersConfig() }],
  exports: [USERS_CONFIG],
})
export class UsersConfigModule {}
