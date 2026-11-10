import { SendNotificationUseCase } from '../../src/application/notifications/send-notification.use-case';
import type { NewNotification, NotificationRepository } from '../../src/application/ports/notification.repository';
import type { NotificationRecord } from '../../src/domain/notifications/notification.types';

describe('SendNotificationUseCase (NTF-008)', () => {
  const fixture = (): { useCase: SendNotificationUseCase; repository: jest.Mocked<NotificationRepository>; record: NotificationRecord } => {
    const record: NotificationRecord = {
      id: 'n1', userId: '6b2bf6ea-4d76-4f3e-84a7-5a7857825b66', type: 'SYSTEM_ALERT', channel: 'IN_APP', recipientEmail: null,
      subject: '[SYSTEM_DOWN] Maintenance', body: 'Update soon', status: 'PENDING', failureReason: null,
      idempotencyKey: 'key-1', requestFingerprint: 'a'.repeat(64), createdAt: new Date('2026-11-01T00:00:00Z'), sentAt: null,
    };
    const repository = {
      create: jest.fn().mockResolvedValue(record),
      findByIdempotencyKey: jest.fn(),
      findByIdempotencyKeyOrCreate: jest.fn().mockImplementation((input: NewNotification) => Promise.resolve({ record: { ...record, ...input }, created: true })),
      updateDelivery: jest.fn().mockImplementation((_id: string, status: 'SENT' | 'FAILED', sentAt: Date | null) => Promise.resolve({ ...record, status, sentAt })),
      list: jest.fn(),
    } as unknown as jest.Mocked<NotificationRepository>;
    const delivery = [{ channel: 'IN_APP' as const, deliver: jest.fn().mockResolvedValue({ accepted: true }) }];
    return { useCase: new SendNotificationUseCase(repository, delivery, () => new Date('2026-11-02T00:00:00Z')), repository, record };
  };

  it('renders and persists in-app notification as SENT, returning only the public projection', async () => {
    const { useCase, repository } = fixture();
    const result = await useCase.execute({ userId: '6b2bf6ea-4d76-4f3e-84a7-5a7857825b66', type: 'SYSTEM_ALERT', channel: 'IN_APP', templateData: { alertCode: 'SYSTEM_DOWN', title: 'Maintenance', message: 'Update soon' }, idempotencyKey: 'key-1' });
    const created = repository.findByIdempotencyKeyOrCreate.mock.calls[0]?.[0];
    expect(created).toBeDefined();
    if (!created) throw new Error('Expected create input');
    expect(created.status).toBe('PENDING');
    expect(created.requestFingerprint).toMatch(/^[0-9a-f]{64}$/);
    expect(result.notification.status).toBe('SENT');
    expect(result.notification).not.toHaveProperty('idempotencyKey');
    expect(result.notification).not.toHaveProperty('requestFingerprint');
    expect(result.notification).not.toHaveProperty('recipientEmail');
  });

  it('records finite email failure and fails closed on storage errors', async () => {
    const { useCase, repository } = fixture();
    const emailCase = new SendNotificationUseCase(repository, [{ channel: 'EMAIL', deliver: jest.fn().mockResolvedValue({ accepted: false, failureCode: 'DELIVERY_UNAVAILABLE' }) }]);
    const result = await emailCase.execute({ userId: '6b2bf6ea-4d76-4f3e-84a7-5a7857825b66', type: 'SYSTEM_ALERT', channel: 'EMAIL', recipientEmail: 'Guest@example.test', templateData: { alertCode: 'SYSTEM_DOWN', title: 'Maintenance', message: 'Update soon' }, idempotencyKey: 'email-key' });
    expect(result.notification.status).toBe('FAILED');
    repository.findByIdempotencyKeyOrCreate.mockRejectedValueOnce(new Error('database connection password leak'));
    await expect(useCase.execute({ userId: '6b2bf6ea-4d76-4f3e-84a7-5a7857825b66', type: 'SYSTEM_ALERT', channel: 'IN_APP', templateData: { alertCode: 'SYSTEM_DOWN', title: 'Maintenance', message: 'Update soon' }, idempotencyKey: 'key-2' })).rejects.toThrow('Notification storage operation failed');
  });
});
