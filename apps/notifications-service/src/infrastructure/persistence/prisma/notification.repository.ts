import { Injectable } from '@nestjs/common';
import type { NotificationRepository, NotificationFilter, NewNotification } from '../../../application/ports/notification.repository';
import type { NotificationRecord } from '../../../domain/notifications/notification.types';
import { PrismaService } from './prisma.service';

function mapRecord(row: Record<string, unknown>): NotificationRecord {
  return {
    id: String(row.id), userId: String(row.userId), type: row.type as NotificationRecord['type'],
    channel: row.channel as NotificationRecord['channel'], recipientEmail: row.recipientEmail as string | null,
    subject: String(row.subject), body: String(row.body), status: row.status as NotificationRecord['status'],
    failureReason: row.failureReason as string | null, idempotencyKey: String(row.idempotencyKey),
    requestFingerprint: String(row.requestFingerprint), createdAt: row.createdAt as Date, sentAt: row.sentAt as Date | null,
  };
}

@Injectable()
export class PrismaNotificationRepository implements NotificationRepository {
  constructor(private readonly prisma: PrismaService) {}

  async create(record: NewNotification): Promise<NotificationRecord> {
    return mapRecord(await this.prisma.notification.create({ data: record as never } as never) as unknown as Record<string, unknown>);
  }

  async findByIdempotencyKey(key: string): Promise<NotificationRecord | null> {
    const row = await this.prisma.notification.findUnique({ where: { idempotencyKey: key } });
    return row ? mapRecord(row as unknown as Record<string, unknown>) : null;
  }

  async findByIdempotencyKeyOrCreate(record: NewNotification): Promise<{ record: NotificationRecord; created: boolean }> {
    try { return { record: await this.create(record), created: true }; }
    catch (error) {
      if (!this.isUniqueViolation(error)) throw error;
      const existing = await this.findByIdempotencyKey(record.idempotencyKey);
      if (!existing) throw error;
      return { record: existing, created: false };
    }
  }

  async updateDelivery(id: string, status: 'SENT' | 'FAILED', sentAt: Date | null, failureReason: string | null): Promise<NotificationRecord> {
    const updated = await this.prisma.notification.update({ where: { id }, data: { status, sentAt, failureReason } });
    return mapRecord(updated as unknown as Record<string, unknown>);
  }

  async list(filter: NotificationFilter): Promise<NotificationRecord[]> {
    const cursorWhere = filter.cursor ? { OR: [
      { createdAt: { lt: filter.cursor.createdAt } },
      { createdAt: filter.cursor.createdAt, id: { lt: filter.cursor.id } },
    ] } : {};
    const rows = await this.prisma.notification.findMany({
      where: { userId: filter.userId, ...(filter.status ? { status: filter.status } : {}), ...(filter.type ? { type: filter.type } : {}), ...cursorWhere },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], take: filter.take,
    });
    return rows.map((row) => mapRecord(row as unknown as Record<string, unknown>));
  }

  private isUniqueViolation(error: unknown): boolean {
    return typeof error === 'object' && error !== null && 'code' in error && error.code === 'P2002';
  }
}
