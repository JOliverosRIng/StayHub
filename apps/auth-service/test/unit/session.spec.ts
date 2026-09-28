import { Session } from '@auth/domain/sessions/session';
import { DomainValidationError } from '@auth/domain/shared/domain-error';

describe('Session', () => {
  const loginAt = new Date('2026-09-28T12:00:00.000Z');

  it('captures an immutable role and exact seven-day absolute expiry', () => {
    const session = Session.create(
      '11111111-1111-4111-8111-111111111111',
      '22222222-2222-4222-8222-222222222222',
      'OWNER',
      loginAt,
    );
    const snapshot = session.snapshot();
    expect(snapshot.role).toBe('OWNER');
    expect(snapshot.absoluteExpiresAt.toISOString()).toBe('2026-10-05T12:00:00.000Z');
  });

  it('does not extend absolute expiry when its state is inspected later', () => {
    const session = Session.create('session', 'user', 'GUEST', loginAt);
    const expiry = session.snapshot().absoluteExpiresAt.getTime();
    expect(session.isActive(new Date('2026-10-05T11:59:59.999Z'))).toBe(true);
    expect(session.isActive(new Date('2026-10-05T12:00:00.000Z'))).toBe(false);
    expect(session.snapshot().absoluteExpiresAt.getTime()).toBe(expiry);
  });

  it('rejects a configurable lifetime that differs from seven days', () => {
    expect(() => Session.create('session', 'user', 'GUEST', loginAt, 3600)).toThrow(
      DomainValidationError,
    );
  });

  it('revokes once and advances the concurrency version', () => {
    const session = Session.create('session', 'user', 'ADMIN', loginAt);
    const revokedAt = new Date('2026-09-29T12:00:00.000Z');
    session.revoke(revokedAt);
    session.revoke(new Date('2026-09-30T12:00:00.000Z'));
    expect(session.snapshot()).toMatchObject({ revokedAt, version: 2, role: 'ADMIN' });
  });
});

