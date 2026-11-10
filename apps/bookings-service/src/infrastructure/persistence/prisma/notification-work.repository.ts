import { Inject, Injectable } from '@nestjs/common';
import type { ClaimedNotificationWork, NotificationWorkPort } from '@bookings/application/ports/notification-work.port';
import type { BookingsConfig } from '@bookings/infrastructure/config/bookings-config';
import { BOOKINGS_CONFIG } from '@bookings/infrastructure/config/config.module';
import { PrismaService } from './prisma.service';

const MAX_BACKOFF_MS = 5 * 60_000;

@Injectable()
export class NotificationWorkRepository implements NotificationWorkPort {
  public constructor(
    private readonly prisma: PrismaService,
    @Inject(BOOKINGS_CONFIG) private readonly config: BookingsConfig,
  ) {}

  public async claim(limit: number): Promise<ClaimedNotificationWork[]> {
    const staleBefore = new Date(Date.now() - this.config.notificationWorkLeaseMs);
    return this.prisma.$transaction(async (tx) => {
      const rows = await tx.$queryRaw<Array<{ id: string; bookingId: string; attempts: number }>>`
        SELECT id, "bookingId", attempts FROM notification_work
        WHERE (status IN ('PENDING', 'FAILED_RETRYABLE') AND "nextAttemptAt" <= NOW())
           OR (status = 'IN_FLIGHT' AND "updatedAt" <= ${staleBefore})
        ORDER BY "nextAttemptAt", id FOR UPDATE SKIP LOCKED LIMIT ${limit}`;
      if (rows.length) {
        await tx.notificationWork.updateMany({
          where: { id: { in: rows.map((row) => row.id) } },
          data: { status: 'IN_FLIGHT', attempts: { increment: 1 } },
        });
      }
      return rows.map((row) => ({ id: row.id, bookingId: row.bookingId, attempts: row.attempts + 1 }));
    });
  }

  public async succeeded(id: string): Promise<void> {
    await this.prisma.notificationWork.update({ where: { id }, data: { status: 'SUCCEEDED', lastErrorCode: null } });
  }

  public async retry(id: string, attempts: number, code: string): Promise<void> {
    const backoff = Math.min(MAX_BACKOFF_MS, this.config.notificationRetryBaseMs * 2 ** Math.max(0, attempts - 1));
    await this.prisma.notificationWork.update({
      where: { id },
      data: { status: 'FAILED_RETRYABLE', lastErrorCode: code.slice(0, 80), nextAttemptAt: new Date(Date.now() + backoff) },
    });
  }

  public async dead(id: string, code: string): Promise<void> {
    await this.prisma.notificationWork.update({ where: { id }, data: { status: 'DEAD', lastErrorCode: code.slice(0, 80) } });
  }
}
