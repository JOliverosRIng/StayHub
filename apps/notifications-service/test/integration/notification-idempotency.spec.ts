import { SendNotificationUseCase, IdempotencyConflictError } from '../../src/application/notifications/send-notification.use-case';
import type { NotificationRepository, NewNotification } from '../../src/application/ports/notification.repository';
import type { NotificationRecord } from '../../src/domain/notifications/notification.types';

describe('notification idempotency (NTF-010)', () => {
  it('serializes a concurrent same-key replay into one row and one email delivery', async () => {
    const records = new Map<string, NotificationRecord>();
    let sequence = 0;
    const repository: NotificationRepository = {
      create: (record: NewNotification): Promise<NotificationRecord> => {
        sequence += 1;
        const created = { ...record, id: `n${sequence}`, createdAt: new Date() };
        records.set(record.idempotencyKey, created);
        return Promise.resolve(created);
      },
      findByIdempotencyKey: (key: string): Promise<NotificationRecord | null> => Promise.resolve(records.get(key) ?? null),
      findByIdempotencyKeyOrCreate: async (record: NewNotification): Promise<{ record: NotificationRecord; created: boolean }> => {
        const existing = records.get(record.idempotencyKey);
        if (existing) return { record: existing, created: false };
        return { record: await repository.create(record), created: true };
      },
      updateDelivery: (id: string, status: 'SENT' | 'FAILED', sentAt: Date | null, failureReason: string | null): Promise<NotificationRecord> => {
        const record = [...records.values()].find((item) => item.id === id);
        if (!record) throw new Error('missing');
        const updated = { ...record, status, sentAt, failureReason };
        records.set(record.idempotencyKey, updated);
        return Promise.resolve(updated);
      },
      list: (): Promise<NotificationRecord[]> => Promise.resolve([...records.values()]),
    };
    const deliver = jest.fn().mockResolvedValue({ accepted: true });
    const useCase = new SendNotificationUseCase(repository, [{ channel: 'EMAIL', deliver }]);
    const command = { userId: '6b2bf6ea-4d76-4f3e-84a7-5a7857825b66', type: 'SYSTEM_ALERT' as const, channel: 'EMAIL' as const, recipientEmail: 'guest@example.test', templateData: { alertCode: 'SYSTEM_DOWN', title: 'Maintenance', message: 'Update soon' }, idempotencyKey: 'global-key' };
    const [first, second] = await Promise.all([useCase.execute(command), useCase.execute(command)]);
    expect(first.notification.id).toBe(second.notification.id);
    expect([first.replayed, second.replayed].sort()).toEqual([false, true]);
    expect(records.size).toBe(1);
    expect(deliver.mock.calls).toHaveLength(1);
    await expect(useCase.execute({ ...command, templateData: { ...command.templateData, message: 'Different content' } })).rejects.toBeInstanceOf(IdempotencyConflictError);
    expect(deliver.mock.calls).toHaveLength(1);
  });
});
