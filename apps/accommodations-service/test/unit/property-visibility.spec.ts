import { randomUUID } from 'node:crypto';
import { GetPropertyUseCase } from '../../src/application/properties/get-property.use-case';
import type { PropertyRepository } from '../../src/application/ports/property.repository';
import type { Principal, Property, PropertyStatus, Role } from '../../src/domain/properties/property.types';
import { canView, isOwner } from '../../src/domain/properties/visibility.policy';
import { presentProperty } from '../../src/interfaces/http/properties/property.presenter';
import { location } from '../fixtures/accommodations.fixture';

const ownerId = randomUUID();
function property(status: PropertyStatus): Property {
  const at = new Date('2026-11-04T10:00:00.000Z');
  return {
    id: randomUUID(), ownerId, type: 'HOTEL', name: 'Hotel', description: null, location, status, version: 3,
    rooms: [{ id: randomUUID(), name: 'R', capacity: 2, basePrice: null }], features: [{ code: 'WIFI', name: 'Wi-Fi' }],
    photos: [{ id: randomUUID(), storageKey: 'a'.repeat(32), mediaType: 'image/png', byteSize: 10, position: 0, createdAt: at }],
    createdAt: at, updatedAt: at,
  };
}
const as = (sub: string, role: Role): Principal => ({ sub, role });

describe('ACC-021 visibility policy', () => {
  it.each([
    ['PUBLISHED', undefined, true], ['PUBLISHED', as(randomUUID(), 'GUEST'), true], ['PUBLISHED', as(ownerId, 'OWNER'), true],
    ['DRAFT', undefined, false], ['DRAFT', as(randomUUID(), 'OWNER'), false], ['DRAFT', as(ownerId, 'GUEST'), false], ['DRAFT', as(ownerId, 'ADMIN'), false], ['DRAFT', as(ownerId, 'OWNER'), true],
    ['UNPUBLISHED', undefined, false], ['UNPUBLISHED', as(randomUUID(), 'OWNER'), false], ['UNPUBLISHED', as(ownerId, 'OWNER'), true],
  ] as [PropertyStatus, Principal | undefined, boolean][])('%s visible to %j: %s', (status, viewer, expected) => {
    expect(canView(property(status), viewer)).toBe(expected);
  });

  it('treats only the OWNER role with the same sub as owner', () => {
    expect(isOwner(property('DRAFT'), as(ownerId, 'OWNER'))).toBe(true);
    expect(isOwner(property('DRAFT'), as(ownerId, 'ADMIN'))).toBe(false);
    expect(isOwner(property('DRAFT'), undefined)).toBe(false);
  });
});

describe('ACC-021 get property use case', () => {
  function repo(found: Property | null): PropertyRepository {
    return {
      findById: () => Promise.resolve(found), create: () => Promise.reject(new Error('unused')),
      replace: () => Promise.reject(new Error('unused')), addPhoto: () => Promise.reject(new Error('unused')),
    };
  }

  it('returns a visible property', async () => {
    const published = property('PUBLISHED');
    await expect(new GetPropertyUseCase(repo(published)).execute(published.id, undefined)).resolves.toBe(published);
  });

  it.each([
    ['missing', null, as(ownerId, 'OWNER')], ['hidden draft', property('DRAFT'), as(randomUUID(), 'OWNER')], ['hidden unpublished', property('UNPUBLISHED'), undefined],
  ] as [string, Property | null, Principal | undefined][])('reports %s as NOT_FOUND', async (_case, found, viewer) => {
    await expect(new GetPropertyUseCase(repo(found)).execute(randomUUID(), viewer)).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });
});

describe('ACC-021 property projection', () => {
  it('omits ownerId for non-owners and never exposes storageKey', () => {
    const view = presentProperty(property('PUBLISHED'), as(randomUUID(), 'OWNER'));
    expect(view).not.toHaveProperty('ownerId');
    expect(JSON.stringify(view)).not.toContain('storageKey');
    expect(view.photos[0]).toEqual({ id: expect.any(String) as unknown, mediaType: 'image/png', byteSize: 10, position: 0, createdAt: '2026-11-04T10:00:00.000Z' });
  });

  it('includes ownerId for the owner', () => {
    expect(presentProperty(property('DRAFT'), as(ownerId, 'OWNER'))).toMatchObject({ ownerId });
  });
});
