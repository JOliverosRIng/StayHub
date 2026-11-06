import { PrismaService } from '../../src/infrastructure/persistence/prisma/prisma.service';
import type { SearchConfig } from '../../src/infrastructure/config/search-config';
describe('Prisma readiness', () => {
  it.each([true, false])('requires a successfully applied migration and index state (ready=%s)', async (ready) => {
    const service = new PrismaService({ databaseUrl: 'postgresql://test:test@localhost/test', dependencyTimeoutMs: 30 } as SearchConfig);
    const query = jest.fn<Promise<{ ready: boolean }[]>, [TemplateStringsArray]>().mockResolvedValue([{ ready }]);
    const execute = jest.fn().mockResolvedValue(1);
    jest.spyOn(service, '$transaction').mockImplementation((async (action: (tx: unknown) => Promise<boolean>) => action({ $queryRaw: query, $executeRaw: execute })) as typeof service.$transaction);
    await expect(service.isHealthy()).resolves.toBe(ready);
    const sql = (query.mock.calls[0]?.[0] as TemplateStringsArray).join('');
    expect(sql).toContain('_prisma_migrations'); expect(sql).toContain('finished_at'); expect(sql).toContain('rolled_back_at'); expect(sql).toContain('search_index_state');
  });
  it('fails closed for database/migration query errors', async () => {
    const service = new PrismaService({ databaseUrl: 'postgresql://test:test@localhost/test', dependencyTimeoutMs: 30 } as SearchConfig);
    jest.spyOn(service, '$transaction').mockRejectedValue(new Error('missing migration table'));
    await expect(service.isHealthy()).resolves.toBe(false);
  });
});
