import { Injectable } from '@nestjs/common';
import type { LoginIdentity, LoginIdentityRepository } from '@users/application/ports/user.repository';
import { PrismaService } from './prisma.service';
@Injectable()
export class PrismaLoginIdentityRepository implements LoginIdentityRepository {
  constructor(private readonly prisma: PrismaService) {}
  async findActiveLoginIdentityByNormalizedEmail(email: string): Promise<LoginIdentity | null> {
    const user = await this.prisma.user.findFirst({ where: { emailNormalized: email, status: 'ACTIVE' }, select: { id: true, role: true, status: true } });
    return user ? { userId: user.id, role: user.role, status: 'ACTIVE' } : null;
  }
}
