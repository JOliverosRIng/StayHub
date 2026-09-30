import { parseProfilePatch } from '../../src/domain/profiles/profile.policy';
describe('USR-046 profile validation / FR-015–019', () => {
  it('trims fields and retains omitted/null distinction', () => {
    expect(parseProfilePatch({ expectedVersion: 1, name: ' New Name ', email: ' New@example.test ', phone: null, preferences: null, photo: null })).toEqual({ expectedVersion: 1, name: 'New Name', email: 'New@example.test', phone: null, preferences: null, photo: null });
    expect(parseProfilePatch({ expectedVersion: 1, name: 'New Name' })).not.toHaveProperty('phone');
  });
  it.each([{ name: null }, { email: null }, { name: 'x' }, { name: 'x'.repeat(101) }, { email: 'invalid' }, { phone: '12345' }, { preferences: [] }, { preferences: { nested: {} } }, { preferences: { null: null } }, { preferences: Object.fromEntries(Array.from({ length: 21 }, (_, i) => [`k${i}`, i])) }, { role: 'ADMIN' }, { version: 99 }, { photo: 'filename' }])('rejects %p', (change) => expect(() => parseProfilePatch({ expectedVersion: 1, ...change })).toThrow());
  it.each([undefined, 0, -1, 1.1, '1', null])('requires positive integer expectedVersion %p', (expectedVersion) => expect(() => parseProfilePatch({ expectedVersion, name: 'Name' })).toThrow());
  it('rejects empty patch and file plus photo:null', () => { expect(() => parseProfilePatch({ expectedVersion: 1 })).toThrow(); expect(() => parseProfilePatch({ expectedVersion: 1, photo: null }, true)).toThrow(); });
  it('accepts photo-only and scalar preferences at boundary', () => {
    expect(parseProfilePatch({ expectedVersion: 1 }, true)).toEqual({ expectedVersion: 1 });
    expect(parseProfilePatch({ expectedVersion: 1, phone: '+573001234567', preferences: Object.fromEntries(Array.from({ length: 20 }, (_, i) => [`k${i}`, i])) }).preferences).toBeDefined();
  });
});
