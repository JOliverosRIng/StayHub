import type { Prisma } from '../../src/infrastructure/persistence/generated/client';
import { PrismaService } from '../../src/infrastructure/persistence/prisma/prisma.service';
import { PrismaUnitOfWork } from '../../src/infrastructure/persistence/prisma/prisma-unit-of-work';

describe('PrismaUnitOfWork', () => {
  it('binds repositories inside a ReadCommitted transaction with bounded waits', async () => {
    const transaction = {} as Prisma.TransactionClient;
    const $transaction = jest.fn((callback: (tx: Prisma.TransactionClient) => Promise<string>) => callback(transaction));
    const prisma = { $transaction } as unknown as PrismaService;
    const repositories = { marker: 'tx-repositories' };
    const repositoryFactory = jest.fn(() => repositories);
    const unitOfWork = new PrismaUnitOfWork(prisma, repositoryFactory);
    const work = jest.fn((bound: typeof repositories) => Promise.resolve(bound.marker));

    await expect(unitOfWork.transaction(work)).resolves.toBe('tx-repositories');
    expect(repositoryFactory).toHaveBeenCalledWith(transaction);
    expect(work).toHaveBeenCalledWith(repositories);
    expect($transaction).toHaveBeenCalledWith(expect.any(Function), {
      isolationLevel: 'ReadCommitted',
      maxWait: 5_000,
      timeout: 5_000,
    });
  });
});
