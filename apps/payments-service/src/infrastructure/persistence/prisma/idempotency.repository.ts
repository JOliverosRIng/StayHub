import { randomUUID } from 'node:crypto';
import { DomainError } from '../../../domain/shared/domain-error';
import type { IdempotencyRecord, IdempotencyRepository } from '../../../application/ports/idempotency.repository';
import { Prisma, type Prisma as PrismaTypes } from '../generated/client';

const UNRESOLVED_STATUSES = new Set(['PENDING', 'REVIEW_REQUIRED']);

function objectOrNull(value: PrismaTypes.JsonValue | null): Readonly<Record<string, unknown>> | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? value as Readonly<Record<string, unknown>>
    : null;
}

function toRecord(row: {
  scope: string;
  key: string;
  callerSubject: string;
  requestFingerprint: string;
  responseStatus: number | null;
  responseBody: PrismaTypes.JsonValue | null;
  resourceId: string | null;
  expiresAt: Date;
}): IdempotencyRecord {
  return {
    scope: row.scope,
    key: row.key,
    callerSubject: row.callerSubject,
    requestFingerprint: row.requestFingerprint,
    responseStatus: row.responseStatus,
    responseBody: objectOrNull(row.responseBody),
    resourceId: row.resourceId,
    expiresAt: row.expiresAt,
  };
}

export class PrismaIdempotencyRepository implements IdempotencyRepository {
  constructor(private readonly prisma: PrismaTypes.TransactionClient) {}

  async find(scope: string, key: string, callerSubject: string): Promise<IdempotencyRecord | null> {
    const row = await this.prisma.idempotencyRecord.findFirst({ where: { scope, key, callerSubject } });
    return row ? toRecord(row) : null;
  }

  async reserve(record: IdempotencyRecord): Promise<{ readonly record: IdempotencyRecord; readonly created: boolean }> {
    if (record.responseStatus !== null || record.responseBody !== null || record.resourceId === null) {
      throw new DomainError('VALIDATION_ERROR', 'Idempotency reservation must be incomplete and tied to a payment');
    }
    if (!/^[a-f0-9]{64}$/i.test(record.requestFingerprint)) {
      throw new DomainError('VALIDATION_ERROR', 'Idempotency request fingerprint is invalid');
    }
    const inserted = await this.prisma.idempotencyRecord.createMany({
      data: [{
        id: randomUUID(),
        scope: record.scope,
        key: record.key,
        callerSubject: record.callerSubject,
        requestFingerprint: record.requestFingerprint,
        responseStatus: null,
        responseBody: Prisma.DbNull,
        resourceId: record.resourceId,
        expiresAt: record.expiresAt,
      }],
      skipDuplicates: true,
    });
    const existing = await this.find(record.scope, record.key, record.callerSubject);
    if (!existing) throw new DomainError('STATE_CONFLICT', 'Idempotency reservation could not be read');
    return { record: existing, created: inserted.count === 1 };
  }

  async complete(
    scope: string,
    key: string,
    callerSubject: string,
    responseStatus: number,
    responseBody: Readonly<Record<string, unknown>>,
    resourceId: string,
  ): Promise<void> {
    const changed = await this.prisma.idempotencyRecord.updateMany({
      where: { scope, key, callerSubject, responseStatus: null },
      data: {
        responseStatus,
        responseBody: responseBody as PrismaTypes.InputJsonObject,
        resourceId,
      },
    });
    if (changed.count !== 1) throw new DomainError('STATE_CONFLICT', 'Idempotency reservation no longer exists');
  }

  async releasePreDispatch(
    scope: string,
    key: string,
    callerSubject: string,
    proof: { readonly dispatch: 'NOT_DISPATCHED'; readonly reason: 'GATEWAY_UNAVAILABLE' },
  ): Promise<void> {
    if (proof.dispatch !== 'NOT_DISPATCHED' || proof.reason !== 'GATEWAY_UNAVAILABLE') {
      throw new DomainError('STATE_CONFLICT', 'Idempotency reservation requires proof of pre-dispatch failure');
    }
    await this.prisma.idempotencyRecord.deleteMany({
      where: { scope, key, callerSubject, responseStatus: null },
    });
  }

  async purgeExpired(now: Date): Promise<number> {
    const expired = await this.prisma.idempotencyRecord.findMany({ where: { expiresAt: { lt: now } } });
    let deleted = 0;
    for (const row of expired) {
      if (row.responseStatus === null) continue;
      const response = objectOrNull(row.responseBody);
      const nestedPayment = response?.payment;
      const responseStatus = response?.status ?? (
        nestedPayment !== null && typeof nestedPayment === 'object' && !Array.isArray(nestedPayment)
          ? (nestedPayment as Record<string, unknown>).status
          : undefined
      );
      if (typeof responseStatus === 'string' && UNRESOLVED_STATUSES.has(responseStatus)) continue;

      if (row.resourceId) {
        const payment = await this.prisma.payment.findUnique({
          where: { id: row.resourceId },
          select: { status: true },
        });
        if (payment && UNRESOLVED_STATUSES.has(payment.status)) continue;
      }
      const result = await this.prisma.idempotencyRecord.deleteMany({ where: { id: row.id, expiresAt: { lt: now } } });
      deleted += result.count;
    }
    return deleted;
  }
}
