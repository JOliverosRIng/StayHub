import { Injectable } from '@nestjs/common';
import { Prisma, type Registration as PrismaRegistration } from '@prisma/client';

import type { RegistrationRepository } from '@auth/application/ports/repositories.port';
import { Registration } from '@auth/domain/registrations/registration';
import { PrismaService } from './prisma.service';

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

type RegistrationClient = Pick<PrismaService, 'registration'> | Prisma.TransactionClient;

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
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  });
}

