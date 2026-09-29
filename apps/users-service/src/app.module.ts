import { Module } from '@nestjs/common';

import { UsersConfigModule } from './infrastructure/config/config.module';

@Module({
  imports: [UsersConfigModule],
})
export class AppModule {}
