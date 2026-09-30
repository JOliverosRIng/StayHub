import { assertOwner } from '../../src/domain/profiles/ownership.policy';
describe('USR-062 ownership', () => {
  it('accepts owner', () => { expect(() => assertOwner('same', 'same')).not.toThrow(); });
  it('rejects every mismatch without a role bypass', () => { expect(() => assertOwner('admin', 'other')).toThrow('FORBIDDEN'); });
});
