import { Injectable } from '@nestjs/common';
import type { Credential as PrismaCredential } from '@prisma/client';

import type { CredentialRepository } from '@auth/application/ports/repositories.port';
import { Credential } from '@auth/domain/credentials/credential';
import { PrismaService } from './prisma.service';

@Injectable()
export class PrismaCredentialRepository implements CredentialRepository {
  public constructor(private readonly prisma: PrismaService) {}

  public async findByUserId(userId: string): Promise<Credential | null> {
    const row = await this.prisma.credential.findUnique({ where: { userId } });
    return row === null ? null : toDomain(row);
  }

  public async save(credential: Credential): Promise<void> {
    const data = credential.snapshot();
    await this.prisma.credential.upsert({
      where: { userId: data.userId },
      create: data,
      update: {
        passwordHash: data.passwordHash,
        status: data.status,
        updatedAt: data.updatedAt,
      },
    });
  }
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

