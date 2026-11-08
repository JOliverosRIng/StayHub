import { ListUserNotificationsUseCase } from '../../src/application/notifications/list-user-notifications.use-case';
import type { NotificationFilter, NotificationRepository } from '../../src/application/ports/notification.repository';
import type { NotificationRecord } from '../../src/domain/notifications/notification.types';

describe('notification listing (NTF-011)', () => {
  it('always scopes by user, requests one extra row, and omits internal fields', async () => {
    const base: NotificationRecord = { id: '6b2bf6ea-4d76-4f3e-84a7-5a7857825b66', userId: 'c5f8971c-15ef-4f25-84e0-7c44576f6629', type: 'SYSTEM_ALERT', channel: 'EMAIL', recipientEmail: 'private@example.test', subject: 'Alert', body: 'Body', status: 'FAILED', failureReason: 'DELIVERY_UNAVAILABLE', idempotencyKey: 'secret-key', requestFingerprint: 'a'.repeat(64), createdAt: new Date('2026-11-01T10:00:00.000Z'), sentAt: null };
    let received: NotificationFilter | undefined;
    const repository = { list: (filter: NotificationFilter): Promise<NotificationRecord[]> => { received = filter; return Promise.resolve([base, { ...base, id: '6b2bf6ea-4d76-4f3e-84a7-5a7857825b67' }]); } } as unknown as NotificationRepository;
    const page = await new ListUserNotificationsUseCase(repository).execute({ userId: base.userId, limit: 1, status: 'FAILED', type: 'SYSTEM_ALERT' });
    expect(received).toMatchObject({ userId: base.userId, take: 2, status: 'FAILED', type: 'SYSTEM_ALERT' });
    expect(page.items).toHaveLength(1);
    expect(page.items[0]).not.toHaveProperty('recipientEmail');
    expect(page.items[0]).not.toHaveProperty('failureReason');
    expect(page.items[0]).not.toHaveProperty('idempotencyKey');
    expect(page.items[0]).not.toHaveProperty('requestFingerprint');
    expect(page.nextCursor).toBeTruthy();
  });
});
