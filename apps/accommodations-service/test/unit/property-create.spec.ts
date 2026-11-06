import { randomUUID } from 'node:crypto';
import { parseCreateProperty } from '../../src/interfaces/http/properties/create-property.dto';
import { CreatePropertyUseCase } from '../../src/application/properties/create-property.use-case';
import type { NewProperty, PropertyRepository } from '../../src/application/ports/property.repository';
import type { Property } from '../../src/domain/properties/property.types';
import { DomainError } from '../../src/domain/shared/domain-error';
import { UUID_PATTERN } from '../../src/domain/shared/uuid';
import { createBody, location, type CreateBody } from '../fixtures/accommodations.fixture';

function fieldOf(action: () => unknown): string | undefined {
  try { action(); } catch (error) { if (error instanceof DomainError) return error.errors[0]?.field; throw error; }
  return undefined;
}

describe('ACC-017 create property input', () => {
  it('parses a complete body into a command', () => {
    expect(parseCreateProperty(createBody())).toEqual({
      type: 'APARTMENT', name: 'Apartamento sintético', description: 'Vista a la montaña', location,
      featureCodes: ['WIFI', 'KITCHEN'], rooms: [{ name: 'Principal', capacity: 2, basePrice: { amount: '120000.00', currency: 'COP' } }],
    });
  });

  it('defaults optional description, featureCodes and basePrice', () => {
    const body: Partial<CreateBody> = createBody({ rooms: [{ name: 'R', capacity: 1 }, { name: 'S', capacity: 3 }] });
    delete body.description; delete body.featureCodes;
    expect(parseCreateProperty(body)).toMatchObject({ description: null, featureCodes: [], rooms: [{ name: 'R', capacity: 1, basePrice: null }, { name: 'S', capacity: 3, basePrice: null }] });
  });

  it.each([
    ['ownerId', { ownerId: randomUUID() }], ['status', { status: 'DRAFT' }], ['version', { version: 1 }], ['id', { id: randomUUID() }], ['photos', { photos: [] }],
  ])('rejects client-controlled %s as an unknown body property', (_key, extra) => {
    expect(fieldOf(() => parseCreateProperty({ ...createBody(), ...extra }))).toBe('body');
  });

  it.each([
    ['non-object body', [], 'body'], ['null body', null, 'body'],
    ['invalid type', createBody({ type: 'CASTLE' }), 'type'],
    ['empty name', createBody({ name: '' }), 'name'],
    ['missing location', { ...createBody(), location: undefined }, 'location'],
    ['empty rooms', createBody({ rooms: [] }), 'rooms'],
    ['room with id on create', createBody({ rooms: [{ id: randomUUID(), name: 'R', capacity: 1 }] }), 'rooms[0]'],
    ['room capacity zero', createBody({ rooms: [{ name: 'R', capacity: 0 }] }), 'rooms[0].capacity'],
    ['duplicated featureCodes', createBody({ featureCodes: ['WIFI', 'WIFI'] }), 'featureCodes'],
  ])('rejects %s', (_case, body, field) => {
    expect(fieldOf(() => parseCreateProperty(body))).toBe(field);
  });
});

describe('ACC-017 create property use case', () => {
  const stored = {} as Property;
  function repository(): { repo: PropertyRepository; created: NewProperty[] } {
    const created: NewProperty[] = [];
    const repo: PropertyRepository = {
      create: (property) => { created.push(property); return Promise.resolve(stored); },
      findById: () => Promise.reject(new Error('unused')),
      replace: () => Promise.reject(new Error('unused')),
      addPhoto: () => Promise.reject(new Error('unused')),
    };
    return { repo, created };
  }

  it('derives ownerId from the authenticated sub and assigns server identifiers', async () => {
    const { repo, created } = repository();
    const sub = randomUUID();
    const result = await new CreatePropertyUseCase(repo).execute({ sub, role: 'OWNER' }, parseCreateProperty(createBody({ rooms: [{ name: 'A', capacity: 1 }, { name: 'B', capacity: 2 }] })));
    expect(result).toBe(stored);
    expect(created).toHaveLength(1);
    const [property] = created;
    expect(property).toMatchObject({ ownerId: sub, type: 'APARTMENT', featureCodes: ['WIFI', 'KITCHEN'] });
    expect(property?.id).toMatch(UUID_PATTERN);
    expect(property?.rooms.map((room) => room.id)).toEqual([expect.stringMatching(UUID_PATTERN), expect.stringMatching(UUID_PATTERN)]);
    expect(new Set(property?.rooms.map((room) => room.id)).size).toBe(2);
  });

  it('propagates repository rejections such as unknown feature codes', async () => {
    const { repo } = repository();
    repo.create = (): Promise<Property> => Promise.reject(new DomainError('VALIDATION_ERROR', [{ field: 'featureCodes', code: 'INVALID_VALUE' }]));
    await expect(new CreatePropertyUseCase(repo).execute({ sub: randomUUID(), role: 'OWNER' }, parseCreateProperty(createBody()))).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
  });
});
