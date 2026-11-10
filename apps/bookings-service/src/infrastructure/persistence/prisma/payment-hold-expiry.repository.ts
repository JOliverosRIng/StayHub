import { Injectable } from '@nestjs/common';
import type { PaymentHoldExpiryPort } from '@bookings/application/ports/payment-saga.port';
import { PrismaService } from './prisma.service';

@Injectable()
export class PaymentHoldExpiryRepository implements PaymentHoldExpiryPort {
  public constructor(private readonly prisma: PrismaService) {}
  public async expire(limit: number): Promise<number> {
    return this.prisma.$transaction(async (tx) => {
      const ids = await tx.$queryRaw<Array<{ id: string }>>`SELECT id FROM bookings WHERE status='PENDING_PAYMENT' AND "holdExpiresAt" <= NOW() ORDER BY "holdExpiresAt" FOR UPDATE SKIP LOCKED LIMIT ${limit}`;
      for (const { id } of ids) { const changed = await tx.booking.updateMany({ where: { id, status: 'PENDING_PAYMENT' }, data: { status: 'EXPIRED', holdExpiresAt: null, version: { increment: 1 } } }); if (changed.count) await tx.bookingTransition.create({ data: { id: crypto.randomUUID(), bookingId: id, fromStatus: 'PENDING_PAYMENT', toStatus: 'EXPIRED', actorType: 'SYSTEM', reasonCode: 'PAYMENT_HOLD_EXPIRED', metadata: {} } }); }
      return ids.length;
    });
  }
}
