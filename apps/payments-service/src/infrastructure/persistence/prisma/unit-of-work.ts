import type { UnitOfWork } from '../../../application/ports/unit-of-work';
import type { PaymentRepository } from '../../../application/ports/payment.repository';
import type { OutboxRepository } from '../../../application/ports/outbox.repository';
import type { IdempotencyRepository } from '../../../application/ports/idempotency.repository';
import type { PrismaService } from './prisma.service';
import { PrismaPaymentRepository } from './payment.repository';
import { PrismaOutboxRepository } from './outbox.repository';
import { PrismaIdempotencyRepository } from './idempotency.repository';

export interface PaymentUnitOfWorkRepositories {
  readonly payments: PaymentRepository;
  readonly outbox: OutboxRepository;
  readonly idempotency: IdempotencyRepository;
}

export class PrismaUnitOfWork implements UnitOfWork<PaymentUnitOfWorkRepositories> {
  constructor(private readonly prisma: PrismaService) {}

  transaction<T>(work: (repositories: PaymentUnitOfWorkRepositories) => Promise<T>): Promise<T> {
    return this.prisma.$transaction((transaction) => work({
      payments: new PrismaPaymentRepository(transaction),
      outbox: new PrismaOutboxRepository(transaction),
      idempotency: new PrismaIdempotencyRepository(transaction),
    }));
  }
}
