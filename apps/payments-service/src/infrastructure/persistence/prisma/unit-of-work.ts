import type { UnitOfWork } from '../../../application/ports/unit-of-work';
import type { PaymentRepository } from '../../../application/ports/payment.repository';
import type { OutboxRepository } from '../../../application/ports/outbox.repository';
import type { IdempotencyRepository } from '../../../application/ports/idempotency.repository';
import type { RefundRepository } from '../../../application/ports/refund.repository';
import type { PrismaService } from './prisma.service';
import { PrismaPaymentRepository } from './payment.repository';
import { PrismaOutboxRepository } from './outbox.repository';
import { PrismaIdempotencyRepository } from './idempotency.repository';
import { PrismaRefundRepository } from './refund.repository';

export interface PaymentUnitOfWorkRepositories {
  readonly payments: PaymentRepository;
  readonly outbox: OutboxRepository;
  readonly idempotency: IdempotencyRepository;
}

export interface RefundUnitOfWorkRepositories extends PaymentUnitOfWorkRepositories {
  readonly refunds: RefundRepository;
}

export class PrismaUnitOfWork implements UnitOfWork<RefundUnitOfWorkRepositories> {
  constructor(private readonly prisma: PrismaService) {}

  transaction<T>(work: (repositories: RefundUnitOfWorkRepositories) => Promise<T>): Promise<T> {
    return this.prisma.$transaction((transaction) => work({
      payments: new PrismaPaymentRepository(transaction),
      refunds: new PrismaRefundRepository(transaction),
      outbox: new PrismaOutboxRepository(transaction),
      idempotency: new PrismaIdempotencyRepository(transaction),
    }));
  }
}
