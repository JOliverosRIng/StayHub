import { Module } from '@nestjs/common';
import { ConfigModule } from './infrastructure/config/config.module';
import { PrismaModule } from './infrastructure/persistence/prisma/prisma.module';
import { SecurityModule } from './infrastructure/security/security.module';

@Module({ imports: [ConfigModule, PrismaModule, SecurityModule] })
export class AppModule {}
