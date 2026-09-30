import { Injectable } from '@nestjs/common';
import { Prisma, type User as StoredUser } from '../generated/prisma';
import { PrismaService } from './prisma.service';
import type { UserRepository, PendingUser, UserSummary } from '@users/application/ports/user.repository';
import { DomainError } from '@users/domain/shared/domain-error';
import { User } from '@users/domain/users/user.entity';
import { assertReplay } from '@users/domain/users/registration.policy';
const summary = (user: StoredUser): UserSummary => ({ id: user.id, name: user.name, email: user.email, role: user.role, status: user.status });
@Injectable()
export class PrismaUserRepository implements UserRepository {
  constructor(private readonly prisma: PrismaService) {}
  async create(command: PendingUser): Promise<UserSummary> {
    const existing = await this.prisma.user.findUnique({ where: { registrationId: command.registrationId } });
    if (existing) { assertReplay(existing, command); return summary(existing); }
    try {
      return summary(await this.prisma.user.create({ data: { id: command.userId, registrationId: command.registrationId, name: command.name, email: command.email, emailNormalized: command.email.toLowerCase(), role: command.role, status: 'PENDING' } }));
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        const replay = await this.prisma.user.findUnique({ where: { registrationId: command.registrationId } });
        if (replay) { assertReplay(replay, command); return summary(replay); }
        throw new DomainError('EMAIL_CONFLICT');
      }
      throw new DomainError('UNAVAILABLE');
    }
  }
  async transition(registrationId: string, status: 'ACTIVE' | 'CANCELLED'): Promise<UserSummary> {
    return this.prisma.$transaction(async (tx) => {
      const rows = await tx.$queryRaw<StoredUser[]>`SELECT * FROM "User" WHERE "registrationId" = ${registrationId}::uuid FOR UPDATE`;
      const current = rows[0];
      if (!current) throw new DomainError('NOT_FOUND');
      User.transition(current.status, status);
      return summary(current.status === status ? current : await tx.user.update({ where: { registrationId }, data: { status } }));
    });
  }
}
