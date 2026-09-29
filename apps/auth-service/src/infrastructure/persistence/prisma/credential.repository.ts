import { Injectable } from '@nestjs/common';
import { Prisma, type Credential as PrismaCredential } from '@prisma/client';

import type { CredentialRepository } from '@auth/application/ports/repositories.port';
import { Credential } from '@auth/domain/credentials/credential';
import { PrismaService } from './prisma.service';

type CredentialClient = Pick<PrismaService, 'credential'> | Prisma.TransactionClient;

@Injectable()
export class PrismaCredentialRepository implements CredentialRepository {
  public constructor(private readonly prisma: PrismaService) {}

  public async findByUserId(userId: string): Promise<Credential | null> {
    const row = await this.prisma.credential.findUnique({ where: { userId } });
    return row === null ? null : toDomain(row);
  }

  public async save(credential: Credential): Promise<void> {
    await persist(this.prisma, credential);
  }
}

export function createCredentialRepository(client: CredentialClient): CredentialRepository {
  return {
    findByUserId: async (userId: string): Promise<Credential | null> => {
      const row = await client.credential.findUnique({ where: { userId } });
      return row === null ? null : toDomain(row);
    },
    save: (credential: Credential): Promise<void> => persist(client, credential),
  };
}

async function persist(client: CredentialClient, credential: Credential): Promise<void> {
  const data = credential.snapshot();
  await client.credential.upsert({
    where: { userId: data.userId },
    create: data,
    update: {
      passwordHash: data.passwordHash,
      status: data.status,
      updatedAt: data.updatedAt,
    },
  });
}

function toDomain(row: PrismaCredential): Credential {
  return Credential.rehydrate({
    userId: row.userId,
    passwordHash: row.passwordHash,
    status: row.status,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  });
}
