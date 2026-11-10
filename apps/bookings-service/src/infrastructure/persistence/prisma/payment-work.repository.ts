import { Injectable } from '@nestjs/common';
import { PrismaService } from './prisma.service';
import type { ClaimedPaymentWork, PaymentWorkPort } from '@bookings/application/ports/payment-saga.port';
import type { RefundWorkPort } from '@bookings/application/ports/payment-refunds.port';

@Injectable()
export class PaymentWorkRepository implements PaymentWorkPort, RefundWorkPort {
  public constructor(private readonly prisma: PrismaService) {}
  public async claim(limit = 10, operation: 'CREATE_ORDER' | 'REQUEST_REFUND' = 'CREATE_ORDER'): Promise<ClaimedPaymentWork[]> {
    return this.prisma.$transaction(async (tx) => {
      const rows = await tx.$queryRaw<Array<{ id: string; bookingId: string; idempotencyKey: string; amount: { toFixed(n: number): string }; currency: string; attempts: number; operation: 'CREATE_ORDER' | 'REQUEST_REFUND' }>>`
        SELECT id,"bookingId","idempotencyKey",amount,currency,attempts,operation FROM payment_work
        WHERE operation=${operation}::"PaymentOperation" AND status IN ('PENDING','FAILED_RETRYABLE') AND "nextAttemptAt" <= NOW()
        ORDER BY "nextAttemptAt",id FOR UPDATE SKIP LOCKED LIMIT ${limit}`;
      if (rows.length) await tx.paymentWork.updateMany({ where: { id: { in: rows.map((row) => row.id) } }, data: { status: 'IN_FLIGHT', attempts: { increment: 1 } } });
      return rows.map((row) => ({ ...row, amount: row.amount.toFixed(2), attempts: row.attempts + 1 }));
    });
  }
  public async succeeded(id: string, paymentOrderId: string): Promise<void> { await this.prisma.$transaction([this.prisma.paymentWork.update({ where: { id }, data: { status: 'SUCCEEDED', lastErrorCode: null } }), this.prisma.booking.update({ where: { id: (await this.prisma.paymentWork.findUniqueOrThrow({ where: { id } })).bookingId }, data: { paymentOrderId, paymentStatus: 'PENDING' } })]); }
  public async succeededRefund(id: string): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      const work = await tx.paymentWork.findUniqueOrThrow({ where: { id } });
      await tx.paymentWork.update({ where: { id }, data: { status: 'SUCCEEDED', lastErrorCode: null } });
      await tx.booking.updateMany({ where: { id: work.bookingId, paymentStatus: { not: 'REFUNDED' } }, data: { paymentStatus: 'REFUND_PENDING' } });
    });
  }
  public async retry(id: string, attempts: number, code: string): Promise<void> { const dead = attempts >= 5; await this.prisma.paymentWork.update({ where: { id }, data: { status: dead ? 'DEAD' : 'FAILED_RETRYABLE', lastErrorCode: code, nextAttemptAt: new Date(Date.now() + Math.min(60_000, 1000 * 2 ** attempts)) } }); }
  public async dead(id: string, code: string): Promise<void> { await this.prisma.paymentWork.update({ where: { id }, data: { status: 'DEAD', lastErrorCode: code } }); }
}
