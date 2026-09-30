import { Email, Name, UserId, RegistrationId, Role, RegistrationStatus } from '../../src/domain/users/values';
import { User } from '../../src/domain/users/user.entity';
describe('USR-023 registration policies / FR-001–006', () => {
  it('normalizes only outer whitespace and case for email equivalence', () => {
    expect(Email.parse('  Person@Example.test  ')).toEqual({ value: 'Person@Example.test', normalized: 'person@example.test' });
    expect(Name.parse('  Test User  ')).toBe('Test User');
  });
  it.each(['x', '', 'a'.repeat(101), null, 22])('rejects invalid name %p', (v) => expect(() => Name.parse(v)).toThrow());
  it.each(['a@', 'a b@example.test', 'x'.repeat(245) + '@example.test', null])('rejects invalid email %p', (v) => expect(() => Email.parse(v)).toThrow());
  it('accepts exact name boundaries', () => { expect(Name.parse('aa')).toBe('aa'); expect(Name.parse('a'.repeat(100))).toHaveLength(100); });
  it('accepts public roles and recognizes ADMIN internally', () => { expect(Role.public('OWNER')).toBe('OWNER'); expect(Role.public('GUEST')).toBe('GUEST'); expect(Role.parse('ADMIN')).toBe('ADMIN'); expect(() => Role.public('ADMIN')).toThrow(); });
  it.each(['PENDING', 'ACTIVE', 'CANCELLED'])('recognizes state %s', (s) => expect(RegistrationStatus.parse(s)).toBe(s));
  it('requires canonical UUIDs', () => { const id = 'a0000000-0000-4000-8000-000000000001'; expect(UserId.parse(id)).toBe(id); expect(RegistrationId.parse(id)).toBe(id); expect(() => UserId.parse(id.toUpperCase())).toThrow(); expect(() => RegistrationId.parse('invalid')).toThrow(); });
  it('transitions idempotently and rejects opposite terminal states', () => {
    expect(User.transition('PENDING', 'ACTIVE')).toBe('ACTIVE'); expect(User.transition('ACTIVE', 'ACTIVE')).toBe('ACTIVE');
    expect(User.transition('PENDING', 'CANCELLED')).toBe('CANCELLED'); expect(User.transition('CANCELLED', 'CANCELLED')).toBe('CANCELLED');
    expect(() => User.transition('CANCELLED', 'ACTIVE')).toThrow('STATE_CONFLICT'); expect(() => User.transition('ACTIVE', 'CANCELLED')).toThrow('STATE_CONFLICT');
  });
});
