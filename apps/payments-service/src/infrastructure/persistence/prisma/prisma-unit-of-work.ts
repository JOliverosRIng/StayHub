import { Prisma } from '../generated/client';
import type { UnitOfWork } from '../../../application/ports/unit-of-work';
import { PrismaService } from './prisma.service';

export type RepositoryFactory<TRepositories> = (
  transaction: Prisma.TransactionClient,
) => TRepositories;

const TRANSACTION_TIMEOUT_MS = 5_000;

export class PrismaUnitOfWork<TRepositories> implements UnitOfWork<TRepositories> {
  public constructor(
    private readonly prisma: PrismaService,
    private readonly repositoriesFor: RepositoryFactory<TRepositories>,
  ) {}

  public transaction<T>(work: (repositories: TRepositories) => Promise<T>): Promise<T> {
    return this.prisma.$transaction(
      (transaction) => work(this.repositoriesFor(transaction)),
      {
        // Row locks and partial unique indexes protect money invariants; keep the
        // transaction short and never include a gateway/network call in `work`.
        isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted,
        maxWait: TRANSACTION_TIMEOUT_MS,
        timeout: TRANSACTION_TIMEOUT_MS,
      },
    );
  }
}
