import { randomUUID } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import { Prisma } from '../generated/prisma';
import { PrismaService } from './prisma.service';
import type { NewPhoto, NewProperty, PropertyRepository } from '@accommodations/application/ports/property.repository';
import type { Photo, PhotoMediaType, Property, ReplacementPlan, RoomData } from '@accommodations/domain/properties/property.types';
import { columnsToLocation, locationToColumns } from '@accommodations/domain/properties/location';
import { DomainError, invalid } from '@accommodations/domain/shared/domain-error';

const include = {
  rooms: { orderBy: [{ createdAt: 'asc' }, { id: 'asc' }] },
  features: { include: { feature: true }, orderBy: { featureCode: 'asc' } },
  photos: { orderBy: { position: 'asc' } },
} satisfies Prisma.PropertyInclude;
type PropertyRow = Prisma.PropertyGetPayload<{ include: typeof include }>;
type PhotoRow = PropertyRow['photos'][number];
type Tx = Prisma.TransactionClient;
const TRANSACTION = { maxWait: 5_000, timeout: 15_000 } as const;

function photoToDomain(row: PhotoRow): Photo {
  return { id: row.id, storageKey: row.storageKey, mediaType: row.mediaType as PhotoMediaType, byteSize: row.byteSize, position: row.position, createdAt: row.createdAt };
}

function toDomain(row: PropertyRow): Property {
  return {
    id: row.id, ownerId: row.ownerId, type: row.type, name: row.name, description: row.description,
    location: columnsToLocation({
      addressLine: row.addressLine, city: row.city, region: row.region, country: row.country, postalCode: row.postalCode,
      latitude: row.latitude === null ? null : row.latitude.toNumber(), longitude: row.longitude === null ? null : row.longitude.toNumber(),
    }),
    status: row.status, version: row.version,
    rooms: row.rooms.map((room) => ({
      id: room.id, name: room.name, capacity: room.capacity,
      basePrice: room.basePriceAmount === null || room.basePriceCurrency === null ? null : { amount: room.basePriceAmount.toFixed(2), currency: room.basePriceCurrency },
    })),
    features: row.features.map(({ feature }) => ({ code: feature.code, name: feature.name })),
    photos: row.photos.map(photoToDomain),
    createdAt: row.createdAt, updatedAt: row.updatedAt,
  };
}

function roomColumns(room: RoomData): { name: string; capacity: number; basePriceAmount: Prisma.Decimal | null; basePriceCurrency: string | null } {
  return {
    name: room.name, capacity: room.capacity,
    basePriceAmount: room.basePrice ? new Prisma.Decimal(room.basePrice.amount) : null, basePriceCurrency: room.basePrice?.currency ?? null,
  };
}

async function assertKnownFeatures(tx: Tx, codes: readonly string[]): Promise<void> {
  if (codes.length === 0) return;
  const known = await tx.feature.count({ where: { code: { in: [...codes] } } });
  if (known !== codes.length) invalid('featureCodes');
}

async function lockAndLoad(tx: Tx, id: string): Promise<Property | null> {
  const locked = await tx.$queryRaw<{ id: string }[]>`SELECT "id" FROM "Property" WHERE "id" = ${id}::uuid FOR UPDATE`;
  if (locked.length === 0) return null;
  return toDomain(await tx.property.findUniqueOrThrow({ where: { id }, include }));
}

function translate(error: unknown): never {
  if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2003') invalid('featureCodes');
  throw error;
}

@Injectable()
export class PrismaPropertyRepository implements PropertyRepository {
  constructor(private readonly prisma: PrismaService) {}

  async create(property: NewProperty): Promise<Property> {
    return this.prisma.$transaction(async (tx) => {
      await assertKnownFeatures(tx, property.featureCodes);
      await tx.property.create({
        data: {
          id: property.id, ownerId: property.ownerId, type: property.type, name: property.name, description: property.description,
          ...locationToColumns(property.location),
          rooms: { createMany: { data: property.rooms.map((room) => ({ id: room.id, ...roomColumns(room) })) } },
          features: { createMany: { data: property.featureCodes.map((featureCode) => ({ featureCode })) } },
        },
      });
      return toDomain(await tx.property.findUniqueOrThrow({ where: { id: property.id }, include }));
    }, TRANSACTION).catch(translate);
  }

  async findById(id: string): Promise<Property | null> {
    const row = await this.prisma.property.findUnique({ where: { id }, include });
    return row ? toDomain(row) : null;
  }

  async replace(id: string, decide: (current: Property) => ReplacementPlan): Promise<Property | null> {
    return this.prisma.$transaction(async (tx) => {
      const current = await lockAndLoad(tx, id);
      if (!current) return null;
      const plan = decide(current);
      await assertKnownFeatures(tx, plan.featureCodes);
      const kept = plan.rooms.flatMap((room) => (room.id ? [room.id] : []));
      await tx.room.deleteMany({ where: { propertyId: id, id: { notIn: kept } } });
      for (const [index, room] of plan.rooms.entries()) {
        if (!room.id) continue;
        const updated = await tx.room.updateMany({ where: { id: room.id, propertyId: id }, data: roomColumns(room) });
        if (updated.count !== 1) invalid(`rooms[${index}].id`);
      }
      const created = plan.rooms.filter((room) => !room.id).map((room) => ({ id: randomUUID(), propertyId: id, ...roomColumns(room) }));
      if (created.length > 0) await tx.room.createMany({ data: created });
      await tx.propertyFeature.deleteMany({ where: { propertyId: id } });
      if (plan.featureCodes.length > 0) await tx.propertyFeature.createMany({ data: plan.featureCodes.map((featureCode) => ({ propertyId: id, featureCode })) });
      const updated = await tx.property.updateMany({
        where: { id, version: current.version },
        data: { type: plan.type, name: plan.name, description: plan.description, status: plan.status, ...locationToColumns(plan.location), version: { increment: 1 } },
      });
      if (updated.count !== 1) throw new DomainError('VERSION_CONFLICT');
      return toDomain(await tx.property.findUniqueOrThrow({ where: { id }, include }));
    }, TRANSACTION).catch(translate);
  }

  async addPhoto(id: string, decide: (current: Property) => Promise<NewPhoto>): Promise<Photo | null> {
    return this.prisma.$transaction(async (tx) => {
      const current = await lockAndLoad(tx, id);
      if (!current) return null;
      const photo = await decide(current);
      return photoToDomain(await tx.photo.create({ data: { ...photo, propertyId: id } }));
    }, TRANSACTION);
  }
}
