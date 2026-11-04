import { randomUUID } from 'node:crypto';
import { DomainError } from '../../src/domain/shared/domain-error';
import {
  parseDescription, parseFeatureCodes, parseName, parsePropertyStatus, parsePropertyType, parseVersion,
} from '../../src/domain/properties/property.policy';
import { assertPublishable, assertTransition } from '../../src/domain/properties/publication.policy';
import { canView, isOwner } from '../../src/domain/properties/visibility.policy';
import type { PropertyStatus } from '../../src/domain/properties/property.types';

function fieldOf(action: () => unknown): string | undefined {
  try { action(); } catch (error) { if (error instanceof DomainError) return error.errors[0]?.field ?? error.code; throw error; }
  return undefined;
}
function codeOf(action: () => unknown): string | undefined {
  try { action(); } catch (error) { if (error instanceof DomainError) return error.code; throw error; }
  return undefined;
}

describe('ACC-009 property values', () => {
  it.each(['HOTEL', 'APARTMENT', 'HOUSE', 'OTHER'])('accepts type %s', (type) => { expect(parsePropertyType(type)).toBe(type); });
  it.each(['hotel', 'HOSTEL', '', null, 1, undefined])('rejects type %p with field type', (type) => { expect(fieldOf(() => parsePropertyType(type))).toBe('type'); });

  it.each(['DRAFT', 'PUBLISHED', 'UNPUBLISHED'])('accepts status %s', (status) => { expect(parsePropertyStatus(status)).toBe(status); });
  it.each(['draft', 'ARCHIVED', null, undefined])('rejects status %p with field status', (status) => { expect(fieldOf(() => parsePropertyStatus(status))).toBe('status'); });

  it('accepts names of 1..120 characters counted as code points', () => {
    expect(parseName('A')).toBe('A');
    expect(parseName('x'.repeat(120))).toHaveLength(120);
    expect(parseName('🏨'.repeat(120))).toBe('🏨'.repeat(120));
  });
  it.each(['', 'x'.repeat(121), null, 5, undefined])('rejects name %p', (name) => { expect(fieldOf(() => parseName(name))).toBe('name'); });

  it('maps an omitted description to null and limits it to 5000 characters', () => {
    expect(parseDescription(undefined)).toBeNull();
    expect(parseDescription('d'.repeat(5000))).toHaveLength(5000);
    for (const value of ['d'.repeat(5001), null, 7]) expect(fieldOf(() => parseDescription(value))).toBe('description');
  });

  it.each([1, 2, 2_147_483_647])('accepts version %p', (version) => { expect(parseVersion(version)).toBe(version); });
  it.each([0, -1, 1.5, '1', null, undefined, 2_147_483_648])('rejects version %p', (version) => { expect(fieldOf(() => parseVersion(version))).toBe('version'); });

  it('accepts up to 50 unique feature codes and defaults to none', () => {
    expect(parseFeatureCodes(undefined)).toEqual([]);
    const fifty = Array.from({ length: 50 }, (_, i) => `CODE_${i}`);
    expect(parseFeatureCodes(fifty)).toEqual(fifty);
  });
  it.each([
    [Array.from({ length: 51 }, (_, i) => `CODE_${i}`)], [['WIFI', 'WIFI']], ['WIFI'], [[1]], [null], [[null]],
  ])('rejects feature codes %p with field featureCodes', (codes) => { expect(fieldOf(() => parseFeatureCodes(codes))).toBe('featureCodes'); });
});

describe('ACC-009 status transitions and publication requirements', () => {
  const allowed: [PropertyStatus, PropertyStatus][] = [['DRAFT', 'PUBLISHED'], ['PUBLISHED', 'UNPUBLISHED'], ['UNPUBLISHED', 'PUBLISHED'], ['DRAFT', 'DRAFT'], ['PUBLISHED', 'PUBLISHED'], ['UNPUBLISHED', 'UNPUBLISHED']];
  const forbidden: [PropertyStatus, PropertyStatus][] = [['PUBLISHED', 'DRAFT'], ['DRAFT', 'UNPUBLISHED'], ['UNPUBLISHED', 'DRAFT']];
  it.each(allowed)('allows %s -> %s', (from, to) => { expect(() => assertTransition(from, to)).not.toThrow(); });
  it.each(forbidden)('rejects %s -> %s with STATE_CONFLICT', (from, to) => { expect(codeOf(() => assertTransition(from, to))).toBe('STATE_CONFLICT'); });

  const complete = {
    name: 'Casa', location: { addressLine: 'Calle 1', city: 'Bogotá', region: 'Cundinamarca', country: 'CO' },
    rooms: [{ name: 'A', capacity: 2, basePrice: null }, { name: 'B', capacity: 1, basePrice: { amount: '10.00', currency: 'COP' } }], photoCount: 1,
  };
  it('accepts a complete property for publication', () => { expect(() => assertPublishable(complete)).not.toThrow(); });
  it.each([
    ['blank name', { ...complete, name: '   ' }],
    ['blank address', { ...complete, location: { ...complete.location, addressLine: ' ' } }],
    ['blank city', { ...complete, location: { ...complete.location, city: '' } }],
    ['blank region', { ...complete, location: { ...complete.location, region: '' } }],
    ['no priced room', { ...complete, rooms: [{ name: 'A', capacity: 2, basePrice: null }] }],
    ['no photo', { ...complete, photoCount: 0 }],
  ])('rejects publication with %s as PUBLICATION_INCOMPLETE', (_case, snapshot) => { expect(codeOf(() => assertPublishable(snapshot))).toBe('PUBLICATION_INCOMPLETE'); });
});

describe('ACC-009 visibility', () => {
  const ownerId = randomUUID();
  const property = (status: PropertyStatus): { ownerId: string; status: PropertyStatus } => ({ ownerId, status });
  it('treats only an OWNER principal with the same sub as the owner', () => {
    expect(isOwner(property('DRAFT'), { sub: ownerId, role: 'OWNER' })).toBe(true);
    expect(isOwner(property('DRAFT'), { sub: ownerId, role: 'GUEST' })).toBe(false);
    expect(isOwner(property('DRAFT'), { sub: randomUUID(), role: 'OWNER' })).toBe(false);
    expect(isOwner(property('DRAFT'), undefined)).toBe(false);
  });
  it('shows PUBLISHED to anyone and DRAFT/UNPUBLISHED only to the owner', () => {
    expect(canView(property('PUBLISHED'), undefined)).toBe(true);
    expect(canView(property('PUBLISHED'), { sub: randomUUID(), role: 'GUEST' })).toBe(true);
    for (const status of ['DRAFT', 'UNPUBLISHED'] as const) {
      expect(canView(property(status), undefined)).toBe(false);
      expect(canView(property(status), { sub: randomUUID(), role: 'OWNER' })).toBe(false);
      expect(canView(property(status), { sub: ownerId, role: 'OWNER' })).toBe(true);
    }
  });
});
