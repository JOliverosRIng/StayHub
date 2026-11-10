import { decodeNotificationCursor, encodeNotificationCursor } from '../../src/domain/notifications/notification-cursor';

describe('notification cursor (NTF-011)', () => {
  it('round trips a versioned compound cursor', () => {
    const cursor = { createdAt: new Date('2026-11-01T10:00:00.000Z'), id: '6b2bf6ea-4d76-4f3e-84a7-5a7857825b66' };
    expect(decodeNotificationCursor(encodeNotificationCursor(cursor))).toEqual(cursor);
  });
  it.each(['', 'not-base64', Buffer.from('{"v":2}').toString('base64url'), Buffer.from('{"v":1,"createdAt":"bad","id":"x"}').toString('base64url')])('rejects malformed cursor %s', (token) => {
    expect(() => decodeNotificationCursor(token)).toThrow('Invalid notification cursor');
  });
});
