import { readdir } from 'node:fs/promises';
import { join } from 'node:path';

export const MIGRATION_SOURCE = Symbol('MIGRATION_SOURCE');

export interface MigrationSource {
  expectedMigrations(): Promise<readonly string[]>;
}

export class FileSystemMigrationSource implements MigrationSource {
  public constructor(private readonly directory = join(process.cwd(), 'prisma', 'migrations')) {}

  public async expectedMigrations(): Promise<readonly string[]> {
    try {
      const entries = await readdir(this.directory, { withFileTypes: true });
      return entries.filter((entry) => entry.isDirectory()).map((entry) => entry.name);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        return [];
      }
      throw error;
    }
  }
}
