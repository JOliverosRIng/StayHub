import { PrismaService } from '../../src/infrastructure/persistence/prisma/prisma.service';
import type { SearchConfig } from '../../src/infrastructure/config/search-config';
import { describeWithPostgres, searchTestDatabaseUrl } from '../helpers/dependencies';

describeWithPostgres('readiness against migrated PostgreSQL', () => {
  const config = { databaseUrl: searchTestDatabaseUrl!, dependencyTimeoutMs: 1000 } as SearchConfig;
  const database = new PrismaService(config);
  afterAll(async () => { await database.$disconnect(); });
  it('accepts the applied Search migration and index state', async () => {
    await expect(database.isHealthy()).resolves.toBe(true);
  });
  it('rejects a schema without migration metadata even when PostgreSQL responds', async () => {
    const url = new URL(searchTestDatabaseUrl!); url.searchParams.set('schema', 'search_unmigrated_probe');
    const unmigrated = new PrismaService({ ...config, databaseUrl: url.toString() });
    try {
      await expect(unmigrated.$queryRaw`SELECT 1`).resolves.toBeDefined();
      await expect(unmigrated.isHealthy()).resolves.toBe(false);
    } finally { await unmigrated.$disconnect(); }
  });
});
