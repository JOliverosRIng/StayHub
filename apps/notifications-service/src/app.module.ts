import { Module } from '@nestjs/common';
import { ConfigModule } from './infrastructure/config/config.module';

@Module({ imports: [ConfigModule] })
export class AppModule {}
