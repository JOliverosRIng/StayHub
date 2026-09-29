import { Injectable } from '@nestjs/common';
import { Prisma } from '../generated/prisma';
import { PrismaService } from './prisma.service';
import type { ProfileRepository, Profile, ProfilePatch, Photo, Preferences } from '@users/application/ports/profile.repository';
import { DomainError } from '@users/domain/shared/domain-error';
const selection = { id: true, name: true, email: true, role: true, phone: true, preferences: true, version: true, photo: { select: { userId: true } } } satisfies Prisma.UserSelect;
type Row = Prisma.UserGetPayload<{ select: typeof selection }>;
function projection(row: Row): Profile { return { id: row.id, name: row.name, email: row.email, role: row.role, phone: row.phone, preferences: row.preferences as Preferences | null, version: row.version, photoUrl: row.photo ? `/internal/v1/users/${row.id}/profile/photo` : null }; }
@Injectable()
export class PrismaProfileRepository implements ProfileRepository {
  constructor(private readonly prisma: PrismaService) {}
  async find(id: string): Promise<Profile | null> {
    const row = await this.prisma.user.findFirst({ where: { id, status: 'ACTIVE' }, select: selection });
    return row ? projection(row) : null;
  }
  async photo(id: string): Promise<Photo | null> {
    const row = await this.prisma.profilePhoto.findFirst({ where: { userId: id, user: { status: 'ACTIVE' } } });
    if (!row) return null;
    return { content: row.content, mediaType: row.mediaType as Photo['mediaType'], byteSize: row.byteSize, sha256: row.sha256 };
  }
  async update(id: string, patch: ProfilePatch, photo?: Photo): Promise<Profile> {
    try {
      return await this.prisma.$transaction(async (tx) => {
        const data: Prisma.UserUpdateManyMutationInput = { version: { increment: 1 } };
        if (patch.name !== undefined) data.name = patch.name;
        if (patch.email !== undefined) { data.email = patch.email; data.emailNormalized = patch.email.toLowerCase(); }
        if (patch.phone !== undefined) data.phone = patch.phone;
        if (patch.preferences !== undefined) data.preferences = patch.preferences === null ? Prisma.DbNull : patch.preferences;
        const result = await tx.user.updateMany({ where: { id, version: patch.expectedVersion, status: 'ACTIVE' }, data });
        if (!result.count) {
          const exists = await tx.user.findFirst({ where: { id, status: 'ACTIVE' }, select: { id: true } });
          throw new DomainError(exists ? 'VERSION_CONFLICT' : 'NOT_FOUND');
        }
        if (photo) { const record = { ...photo, content: Buffer.from(photo.content) }; await tx.profilePhoto.upsert({ where: { userId: id }, create: { userId: id, ...record }, update: record }); }
        else if (patch.photo === null) await tx.profilePhoto.deleteMany({ where: { userId: id } });
        return projection(await tx.user.findUniqueOrThrow({ where: { id }, select: selection }));
      });
    } catch (error) {
      if (error instanceof DomainError) throw error;
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') throw new DomainError('EMAIL_CONFLICT');
      throw new DomainError('UNAVAILABLE');
    }
  }
}
