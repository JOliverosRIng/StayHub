import { randomUUID } from 'node:crypto';
import { planReplacement } from '../../src/application/properties/replace-property.use-case';
import { parseReplaceProperty } from '../../src/interfaces/http/properties/replace-property.dto';
import type { Principal, Property, PropertyStatus } from '../../src/domain/properties/property.types';
import { DomainError } from '../../src/domain/shared/domain-error';
import { location, replaceBody } from '../fixtures/accommodations.fixture';

function codeOf(action: () => unknown): string | undefined {
  try { action(); } catch (error) { if (error instanceof DomainError) return error.code; throw error; }
  return undefined;
}

const ownerId = randomUUID();
const roomId = randomUUID();
const owner: Principal = { sub: ownerId, role: 'OWNER' };
function current(status: PropertyStatus, photos = 0): Property {
  const at = new Date('2026-11-04T12:00:00.000Z');
  return {
    id: randomUUID(), ownerId, type: 'HOUSE', name: 'Casa', description: null, location, status, version: 1,
    rooms: [{ id: roomId, name: 'A', capacity: 2, basePrice: { amount: '10.00', currency: 'COP' } }],
    features: [], photos: Array.from({ length: photos }, (_, position) => ({
      id: randomUUID(), storageKey: 'k'.repeat(32), mediaType: 'image/png', byteSize: 10, position, createdAt: at,
    })),
    createdAt: at, updatedAt: at,
  };
}

describe('ACC-026 publication planner', () => {
  it('publishes a complete DRAFT', () => {
    expect(planReplacement(current('DRAFT', 1), owner, parseReplaceProperty(replaceBody({
      type: 'HOUSE', name: 'Casa', location, status: 'PUBLISHED', version: 1,
      rooms: [{ id: roomId, name: 'A', capacity: 2, basePrice: { amount: '10.00', currency: 'COP' } }],
    })))).toMatchObject({ status: 'PUBLISHED' });
  });

  it('allows unpublishing and republishing', () => {
    expect(planReplacement(current('PUBLISHED', 1), owner, parseReplaceProperty(replaceBody({
      type: 'HOUSE', name: 'Casa', location, status: 'UNPUBLISHED', version: 1, rooms: [{ id: roomId, name: 'A', capacity: 2, basePrice: { amount: '10.00', currency: 'COP' } }],
    })))).toMatchObject({ status: 'UNPUBLISHED' });
  });

  it('rejects incomplete publication after version and room-id checks', () => {
    expect(codeOf(() => planReplacement(current('DRAFT', 0), owner, parseReplaceProperty(replaceBody({
      version: 99, rooms: [{ id: randomUUID(), name: 'X', capacity: 1 }], status: 'PUBLISHED',
    }))))).toBe('VERSION_CONFLICT');
    expect(codeOf(() => planReplacement(current('DRAFT', 0), owner, parseReplaceProperty(replaceBody({
      rooms: [{ id: randomUUID(), name: 'X', capacity: 1 }], status: 'PUBLISHED',
    }))))).toBe('VALIDATION_ERROR');
    expect(codeOf(() => planReplacement(current('DRAFT', 0), owner, parseReplaceProperty(replaceBody({
      type: 'HOUSE', name: 'Casa', location, status: 'PUBLISHED', version: 1,
      rooms: [{ id: roomId, name: 'A', capacity: 2, basePrice: { amount: '10.00', currency: 'COP' } }],
    }))))).toBe('PUBLICATION_INCOMPLETE');
  });

  it('rejects forbidden transitions before publication completeness', () => {
    expect(codeOf(() => planReplacement(current('PUBLISHED', 0), owner, parseReplaceProperty(replaceBody({
      type: 'HOUSE', name: 'Casa', location, status: 'DRAFT', version: 1, rooms: [{ id: roomId, name: 'A', capacity: 1 }],
    }))))).toBe('STATE_CONFLICT');
  });
});
