import { Global, Module } from '@nestjs/common';
import { loadUsersConfig, USERS_CONFIG } from './users-config';
@Global()
@Module({ providers: [{ provide: USERS_CONFIG, useFactory: loadUsersConfig }], exports: [USERS_CONFIG] })
export class ConfigModule {}
