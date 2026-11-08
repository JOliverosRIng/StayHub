import { Module } from '@nestjs/common';
import { ConfigModule } from './infrastructure/config/config.module';
import { PrismaModule } from './infrastructure/persistence/prisma/prisma.module';

@Module({ imports: [ConfigModule, PrismaModule] })
export class AppModule {}
