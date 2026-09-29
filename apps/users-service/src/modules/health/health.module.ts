import { Module } from '@nestjs/common';

import { HealthController } from './health.controller';
import { FileSystemMigrationSource, MIGRATION_SOURCE } from './migration-source';

@Module({
  controllers: [HealthController],
  providers: [{ provide: MIGRATION_SOURCE, useFactory: (): FileSystemMigrationSource => new FileSystemMigrationSource() }],
})
export class HealthModule {}
