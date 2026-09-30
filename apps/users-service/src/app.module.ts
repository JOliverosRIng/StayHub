import { Module } from '@nestjs/common';
import { ConfigModule } from './infrastructure/config/config.module';
import { PrismaModule } from './infrastructure/persistence/prisma/prisma.module';
import { UsersAuthModule } from './modules/users-auth.module';
import { HealthModule } from './modules/health/health.module';
import { RegistrationStateModule } from './modules/registration-state.module';
import { LoginLookupModule } from './modules/login-lookup.module';
import { ProfilesModule } from './modules/profiles.module';

@Module({ imports: [ConfigModule, PrismaModule, UsersAuthModule, HealthModule, RegistrationStateModule, LoginLookupModule, ProfilesModule] })
export class AppModule {}
