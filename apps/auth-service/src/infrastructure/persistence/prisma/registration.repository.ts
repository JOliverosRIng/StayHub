import { Injectable } from '@nestjs/common';
import { Prisma, type Registration as PrismaRegistration } from '@prisma/client';

import {
  type RegistrationClaimOneResult,
  type RegistrationWorkContext,
  type RegistrationWorkPort,
} from '@auth/application/ports/registration-work.port';
import type { RegistrationRepository } from '@auth/application/ports/repositories.port';
import { Registration } from '@auth/domain/registrations/registration';
import { createCredentialRepository } from './credential.repository';
import { PrismaService } from './prisma.service';

type RawExecutor = {
  $queryRaw<T = unknown>(strings: TemplateStringsArray, ...values: unknown[]): Promise<T>;
};

type RegistrationClient = (
  | Pick<PrismaService, 'registration'>
  | Prisma.TransactionClient
) &
  RawExecutor;

@Injectable()
export class PrismaRegistrationRepository implements RegistrationRepository {
  public constructor(private readonly prisma: PrismaService) {}

  public async findById(id: string): Promise<Registration | null> {
    const row = await this.prisma.registration.findUnique({ where: { id } });
    return row === null ? null : toDomain(row);
  }

  public async save(registration: Registration): Promise<void> {
    await persist(this.prisma, registration);
  }

  public withLocked<T>(
    id: string,
    work: (registration: Registration | null) => Promise<T>,
  ): Promise<T> {
    return this.prisma.transaction(
      async (transaction) => {
        await transaction.$queryRaw`SELECT "id" FROM "Registration" WHERE "id" = ${id}::uuid FOR UPDATE`;
        const row = await transaction.registration.findUnique({ where: { id } });
        const registration = row === null ? null : toDomain(row);
        const result = await work(registration);
        if (registration !== null) await persist(transaction, registration);
        return result;
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );
  }
}

@Injectable()
export class PrismaRegistrationWork implements RegistrationWorkPort {
  public constructor(private readonly prisma: PrismaService) {}

  public async createOrRead(registration: Registration): Promise<Registration> {
    const data = registration.snapshot();
    await this.prisma.$executeRaw`
      INSERT INTO "Registration" (
        "id", "requestFingerprint", "userId", "state", "attemptCount", "lastErrorCode",
        "expiresAt", "processingOwner", "leaseUntil", "nextAttemptAt", "createdAt", "updatedAt"
      ) VALUES (
        ${data.id}::uuid,
        ${data.requestFingerprint},
        ${data.userId}::uuid,
        ${data.state}::"RegistrationState",
        ${data.attemptCount},
        ${data.lastErrorCode},
        ${data.expiresAt},
        ${data.processingOwner}::uuid,
        ${data.leaseUntil},
        ${data.nextAttemptAt},
        ${data.createdAt},
        ${data.updatedAt}
      )
      ON CONFLICT ("id") DO NOTHING
    `;
    const byId = await this.prisma.registration.findUnique({ where: { id: data.id } });
    if (byId !== null) return toDomain(byId);
    const byUser = await this.prisma.registration.findUnique({ where: { userId: data.userId } });
    if (byUser !== null) return toDomain(byUser);
    throw new Error('Registration insert did not produce a readable row');
  }

  public claimOne(
    id: string,
    owner: string,
    now: Date,
    leaseUntil: Date,
  ): Promise<RegistrationClaimOneResult> {
    return this.prisma.transaction(async (transaction) => {
      const locked = await transaction.$queryRaw<PrismaRegistration[]>`
        SELECT * FROM "Registration" WHERE "id" = ${id}::uuid FOR UPDATE
      `;
      const current = locked[0];
      if (current === undefined) return { status: 'missing' };
      if (current.state === 'COMPLETED' || current.state === 'CANCELLED') {
        return { status: 'terminal', registration: toDomain(current) };
      }
      const leaseHeld =
        current.processingOwner !== null &&
        current.leaseUntil !== null &&
        current.leaseUntil >= now;
      if (leaseHeld) return { status: 'busy' };
      const updated = await transaction.$queryRaw<PrismaRegistration[]>`
        UPDATE "Registration"
        SET "processingOwner" = ${owner}::uuid, "leaseUntil" = ${leaseUntil}, "updatedAt" = ${now}
        WHERE "id" = ${id}::uuid
        RETURNING *
      `;
      const claimed = updated[0];
      if (claimed === undefined) return { status: 'busy' };
      return { status: 'claimed', registration: toDomain(claimed) };
    });
  }

  public claimBatch(
    owner: string,
    now: Date,
    limit: number,
    leaseUntil: Date,
  ): Promise<readonly Registration[]> {
    return this.prisma.transaction(async (transaction) => {
      const rows = await transaction.$queryRaw<PrismaRegistration[]>`
        WITH selected AS (
          SELECT "id" FROM "Registration"
          WHERE "state" NOT IN ('COMPLETED'::"RegistrationState", 'CANCELLED'::"RegistrationState")
            AND "nextAttemptAt" <= ${now}
            AND ("processingOwner" IS NULL OR "leaseUntil" IS NULL OR "leaseUntil" < ${now})
          ORDER BY "nextAttemptAt" ASC, "createdAt" ASC
          LIMIT ${limit}
          FOR UPDATE SKIP LOCKED
        )
        UPDATE "Registration" AS r
        SET "processingOwner" = ${owner}::uuid, "leaseUntil" = ${leaseUntil}, "updatedAt" = ${now}
        FROM selected
        WHERE r."id" = selected."id"
        RETURNING r.*
      `;
      return rows.map(toDomain);
    });
  }

  public async renew(
    id: string,
    owner: string,
    now: Date,
    leaseUntil: Date,
  ): Promise<Registration | null> {
    const rows = await this.prisma.$queryRaw<PrismaRegistration[]>`
      UPDATE "Registration"
      SET "leaseUntil" = ${leaseUntil}, "updatedAt" = ${now}
      WHERE "id" = ${id}::uuid
        AND "processingOwner" = ${owner}::uuid
        AND "leaseUntil" IS NOT NULL
        AND "leaseUntil" >= ${now}
      RETURNING *
    `;
    return rows[0] === undefined ? null : toDomain(rows[0]);
  }

  public async release(id: string, owner: string, now: Date): Promise<boolean> {
    const affected = await this.prisma.$executeRaw`
      UPDATE "Registration"
      SET "processingOwner" = NULL, "leaseUntil" = NULL, "updatedAt" = ${now}
      WHERE "id" = ${id}::uuid AND "processingOwner" = ${owner}::uuid
    `;
    return affected > 0;
  }

  public transaction<T>(work: (context: RegistrationWorkContext) => Promise<T>): Promise<T> {
    return this.prisma.transaction((transaction) =>
      work({
        registrations: createRegistrationRepository(transaction),
        credentials: createCredentialRepository(transaction),
      }),
    );
  }
}

export function createRegistrationRepository(client: RegistrationClient): RegistrationRepository {
  return {
    findById: async (id: string): Promise<Registration | null> => {
      const row = await client.registration.findUnique({ where: { id } });
      return row === null ? null : toDomain(row);
    },
    save: (registration: Registration): Promise<void> => persist(client, registration),
    withLocked: async <T>(
      id: string,
      work: (registration: Registration | null) => Promise<T>,
    ): Promise<T> => {
      await client.$queryRaw`SELECT "id" FROM "Registration" WHERE "id" = ${id}::uuid FOR UPDATE`;
      const row = await client.registration.findUnique({ where: { id } });
      const registration = row === null ? null : toDomain(row);
      const result = await work(registration);
      if (registration !== null) await persist(client, registration);
      return result;
    },
  };
}

async function persist(client: RegistrationClient, registration: Registration): Promise<void> {
  const data = registration.snapshot();
  await client.registration.upsert({
    where: { id: data.id },
    create: data,
    update: {
      state: data.state,
      attemptCount: data.attemptCount,
      lastErrorCode: data.lastErrorCode,
      expiresAt: data.expiresAt,
      processingOwner: data.processingOwner,
      leaseUntil: data.leaseUntil,
      nextAttemptAt: data.nextAttemptAt,
      updatedAt: data.updatedAt,
    },
  });
}

function toDomain(row: PrismaRegistration): Registration {
  return Registration.rehydrate({
    id: row.id,
    requestFingerprint: row.requestFingerprint,
    userId: row.userId,
    state: row.state,
    attemptCount: row.attemptCount,
    lastErrorCode: row.lastErrorCode,
    expiresAt: row.expiresAt,
    processingOwner: row.processingOwner,
    leaseUntil: row.leaseUntil,
    nextAttemptAt: row.nextAttemptAt,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  });
}
