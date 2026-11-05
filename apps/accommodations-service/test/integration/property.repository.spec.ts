import { randomUUID } from 'node:crypto';
import { postgresHarness, type Harness } from './postgres.setup';
import { PROPERTY_REPOSITORY, type PropertyRepository } from '../../src/application/ports/property.repository';
import type { Property, ReplacementPlan } from '../../src/domain/properties/property.types';
import { DomainError } from '../../src/domain/shared/domain-error';
import { newProperty } from '../fixtures/accommodations.fixture';

function planFrom(current: Property, overrides: Partial<ReplacementPlan> = {}): ReplacementPlan {
  return {
    type: current.type, name: current.name, description: current.description, location: current.location, status: current.status,
    featureCodes: current.features.map((f) => f.code), rooms: current.rooms.map(({ id, name, capacity, basePrice }) => ({ id, name, capacity, basePrice })),
    ...overrides,
  };
}

describe('ACC-010/012 Prisma property repository', () => {
  let h: Harness; let repo: PropertyRepository;
  beforeAll(async () => { h = await postgresHarness(); repo = h.app.get<PropertyRepository>(PROPERTY_REPOSITORY); });
  afterAll(async () => { await h?.close(); });
  afterEach(async () => { await h.reset(); });

  it('creates the aggregate atomically as DRAFT version 1 and reads it back', async () => {
    const input = newProperty();
    const created = await repo.create(input);
    expect(created).toMatchObject({
      id: input.id, ownerId: input.ownerId, type: 'APARTMENT', name: input.name, description: input.description, location: input.location,
      status: 'DRAFT', version: 1, photos: [],
      features: [{ code: 'KITCHEN', name: 'Kitchen' }, { code: 'WIFI', name: 'Wi-Fi' }],
    });
    expect(created.rooms).toEqual(expect.arrayContaining(input.rooms));
    expect(created.rooms).toHaveLength(2);
    expect(created.createdAt).toBeInstanceOf(Date);
    expect(await repo.findById(input.id)).toEqual(created);
  });

  it('round-trips decimal prices as fixed strings and omits absent optional location fields', async () => {
    const input = newProperty(randomUUID(), {
      description: null, location: { addressLine: 'A', city: 'B', region: 'C', country: 'AR' },
      rooms: [{ id: randomUUID(), name: 'R', capacity: 3, basePrice: { amount: '99.5', currency: 'ARS' } }],
    });
    const created = await repo.create(input);
    expect(created.location).toEqual({ addressLine: 'A', city: 'B', region: 'C', country: 'AR' });
    expect(created.description).toBeNull();
    expect(created.rooms[0]?.basePrice).toEqual({ amount: '99.50', currency: 'ARS' });
  });

  it('rejects unknown feature codes with VALIDATION_ERROR featureCodes and writes nothing', async () => {
    await expect(repo.create(newProperty(randomUUID(), { featureCodes: ['WIFI', 'SPA'] }))).rejects.toMatchObject({ code: 'VALIDATION_ERROR', errors: [{ field: 'featureCodes', code: 'INVALID_VALUE' }] });
    expect([await h.db.property.count(), await h.db.room.count(), await h.db.propertyFeature.count()]).toEqual([0, 0, 0]);
  });

  it('returns null for an unknown property', async () => {
    expect(await repo.findById(randomUUID())).toBeNull();
    expect(await repo.replace(randomUUID(), () => { throw new Error('must not decide'); })).toBeNull();
  });

  it('replaces fields, rooms and features in one transaction and increments version', async () => {
    const created = await repo.create(newProperty());
    const [kept, removed] = created.rooms;
    const replaced = await repo.replace(created.id, (current) => planFrom(current, {
      name: 'Nuevo nombre', description: null, type: 'HOUSE', featureCodes: ['POOL'],
      rooms: [{ id: kept!.id, name: 'Renombrada', capacity: 5, basePrice: null }, { name: 'Nueva', capacity: 1, basePrice: { amount: '10', currency: 'USD' } }],
    }));
    expect(replaced).toMatchObject({ name: 'Nuevo nombre', description: null, type: 'HOUSE', version: 2, features: [{ code: 'POOL', name: 'Pool' }] });
    expect(replaced!.rooms).toHaveLength(2);
    expect(replaced!.rooms).toContainEqual({ id: kept!.id, name: 'Renombrada', capacity: 5, basePrice: null });
    expect(replaced!.rooms).toContainEqual(expect.objectContaining({ name: 'Nueva', capacity: 1, basePrice: { amount: '10.00', currency: 'USD' } }));
    expect(replaced!.rooms.map((r) => r.id)).not.toContain(removed!.id);
    expect(await h.db.room.findUnique({ where: { id: removed!.id } })).toBeNull();
    expect(replaced!.updatedAt.getTime()).toBeGreaterThanOrEqual(created.updatedAt.getTime());
  });

  it('leaves the aggregate untouched when the decision fails or a feature is unknown', async () => {
    const created = await repo.create(newProperty());
    await expect(repo.replace(created.id, () => { throw new DomainError('VERSION_CONFLICT'); })).rejects.toMatchObject({ code: 'VERSION_CONFLICT' });
    await expect(repo.replace(created.id, (current) => planFrom(current, { name: 'Cambiado', rooms: [{ name: 'Otra', capacity: 1, basePrice: null }], featureCodes: ['SPA'] })))
      .rejects.toMatchObject({ code: 'VALIDATION_ERROR', errors: [{ field: 'featureCodes', code: 'INVALID_VALUE' }] });
    expect(await repo.findById(created.id)).toEqual(created);
  });

  it('serializes concurrent replacements so only one wins for the same version', async () => {
    const created = await repo.create(newProperty());
    const attempt = (name: string): Promise<Property | null> => repo.replace(created.id, (current) => {
      if (current.version !== created.version) throw new DomainError('VERSION_CONFLICT');
      return planFrom(current, { name });
    });
    const results = await Promise.allSettled([attempt('Uno'), attempt('Dos')]);
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    expect(results.filter((r): r is PromiseRejectedResult => r.status === 'rejected').map((r): unknown => r.reason)).toEqual([expect.objectContaining({ code: 'VERSION_CONFLICT' })]);
    expect((await repo.findById(created.id))?.version).toBe(2);
  });

  it('adds photo metadata without incrementing version and rolls back when the decision fails', async () => {
    const created = await repo.create(newProperty());
    const photo = await repo.addPhoto(created.id, (current) => Promise.resolve({ id: randomUUID(), storageKey: randomUUID(), mediaType: 'image/png', byteSize: 20, position: current.photos.length }));
    expect(photo).toMatchObject({ mediaType: 'image/png', byteSize: 20, position: 0 });
    const after = await repo.findById(created.id);
    expect(after?.version).toBe(1);
    expect(after?.photos).toEqual([photo]);
    await expect(repo.addPhoto(created.id, () => Promise.reject(new DomainError('PHOTO_LIMIT_REACHED')))).rejects.toMatchObject({ code: 'PHOTO_LIMIT_REACHED' });
    expect(await h.db.photo.count()).toBe(1);
    expect(await repo.addPhoto(randomUUID(), () => Promise.reject(new Error('must not decide')))).toBeNull();
  });
});
