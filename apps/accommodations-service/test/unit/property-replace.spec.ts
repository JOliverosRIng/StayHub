import { randomUUID } from 'node:crypto';
import { parseReplaceProperty } from '../../src/interfaces/http/properties/replace-property.dto';
import { planReplacement, ReplacePropertyUseCase } from '../../src/application/properties/replace-property.use-case';
import type { PropertyRepository } from '../../src/application/ports/property.repository';
import type { Principal, Property, ReplacementPlan } from '../../src/domain/properties/property.types';
import { DomainError } from '../../src/domain/shared/domain-error';
import { location, replaceBody } from '../fixtures/accommodations.fixture';

function fieldOf(action: () => unknown): string | undefined {
  try { action(); } catch (error) { if (error instanceof DomainError) return error.errors[0]?.field; throw error; }
  return undefined;
}
function codeOf(action: () => unknown): string | undefined {
  try { action(); } catch (error) { if (error instanceof DomainError) return error.code; throw error; }
  return undefined;
}

const ownerId = randomUUID();
const roomId = randomUUID();
const owner: Principal = { sub: ownerId, role: 'OWNER' };
function current(overrides: Partial<Property> = {}): Property {
  const at = new Date('2026-11-04T12:00:00.000Z');
  return {
    id: randomUUID(), ownerId, type: 'APARTMENT', name: 'Apartamento sintético', description: 'Vista a la montaña', location,
    status: 'DRAFT', version: 1, rooms: [{ id: roomId, name: 'Principal', capacity: 2, basePrice: { amount: '120000.00', currency: 'COP' } }],
    features: [{ code: 'WIFI', name: 'Wi-Fi' }], photos: [], createdAt: at, updatedAt: at, ...overrides,
  };
}

describe('ACC-025 replace property input', () => {
  it('parses a complete replacement including optional room id', () => {
    const id = randomUUID();
    expect(parseReplaceProperty(replaceBody({ rooms: [{ id, name: 'R', capacity: 2 }], status: 'UNPUBLISHED', version: 4 }))).toMatchObject({
      status: 'UNPUBLISHED', version: 4, rooms: [{ id, name: 'R', capacity: 2, basePrice: null }],
    });
  });

  it('clears description and basePrice when omitted', () => {
    const body: Partial<ReturnType<typeof replaceBody>> = replaceBody({ rooms: [{ name: 'R', capacity: 1 }] });
    delete body.description;
    expect(parseReplaceProperty(body)).toMatchObject({ description: null, rooms: [{ name: 'R', capacity: 1, basePrice: null }] });
  });

  it.each([
    ['missing version', { ...replaceBody(), version: undefined }, 'version'],
    ['version 0', replaceBody({ version: 0 }), 'version'],
    ['missing status', { ...replaceBody(), status: undefined }, 'status'],
    ['empty rooms', replaceBody({ rooms: [] }), 'rooms'],
    ['unknown root field', { ...replaceBody(), ownerId }, 'body'],
  ])('rejects %s', (_case, body, field) => {
    expect(fieldOf(() => parseReplaceProperty(body))).toBe(field);
  });
});

describe('ACC-025 replacement planner', () => {
  it('returns the replacement plan for the owner with a matching version', () => {
    const command = parseReplaceProperty(replaceBody({ name: 'Nuevo', rooms: [{ id: roomId, name: 'Principal', capacity: 4, basePrice: { amount: '1.00', currency: 'COP' } }] }));
    expect(planReplacement(current(), owner, command)).toMatchObject({ name: 'Nuevo', status: 'DRAFT', rooms: [{ id: roomId, capacity: 4 }] });
  });

  it('reports a foreign owner as NOT_FOUND before version or room checks', () => {
    expect(codeOf(() => planReplacement(current(), { sub: randomUUID(), role: 'OWNER' }, parseReplaceProperty(replaceBody({ version: 99, rooms: [{ id: randomUUID(), name: 'X', capacity: 1 }] }))))).toBe('NOT_FOUND');
  });

  it('reports a stale version as VERSION_CONFLICT before unknown room ids', () => {
    expect(codeOf(() => planReplacement(current(), owner, parseReplaceProperty(replaceBody({ version: 2, rooms: [{ id: randomUUID(), name: 'X', capacity: 1 }] }))))).toBe('VERSION_CONFLICT');
  });

  it('rejects an unknown or foreign room id with rooms[i].id', () => {
    expect(fieldOf(() => planReplacement(current(), owner, parseReplaceProperty(replaceBody({ rooms: [{ id: randomUUID(), name: 'X', capacity: 1 }] }))))).toBe('rooms[0].id');
  });

  it('allows creating a room without id and dropping omitted rooms', () => {
    const plan = planReplacement(current(), owner, parseReplaceProperty(replaceBody({ rooms: [{ name: 'Nueva', capacity: 1 }] })));
    expect(plan.rooms).toEqual([{ name: 'Nueva', capacity: 1, basePrice: null }]);
  });
});

describe('ACC-025 replace property use case', () => {
  it('returns NOT_FOUND when the repository yields null', async () => {
    const repo: PropertyRepository = {
      replace: () => Promise.resolve(null), create: () => Promise.reject(new Error('unused')),
      findById: () => Promise.reject(new Error('unused')), addPhoto: () => Promise.reject(new Error('unused')),
    };
    await expect(new ReplacePropertyUseCase(repo).execute(randomUUID(), owner, parseReplaceProperty(replaceBody()))).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });

  it('passes the planner into the locked replace callback', async () => {
    const existing = current();
    let plan: ReplacementPlan | undefined;
    const stored = { ...existing, version: 2, name: 'Nuevo' };
    const repo: PropertyRepository = {
      replace: (_id, decide) => { plan = decide(existing); return Promise.resolve(stored); },
      create: () => Promise.reject(new Error('unused')), findById: () => Promise.reject(new Error('unused')), addPhoto: () => Promise.reject(new Error('unused')),
    };
    await expect(new ReplacePropertyUseCase(repo).execute(existing.id, owner, parseReplaceProperty(replaceBody({ name: 'Nuevo', rooms: [{ id: roomId, name: 'Principal', capacity: 2 }] })))).resolves.toBe(stored);
    expect(plan).toMatchObject({ name: 'Nuevo' });
  });
});
