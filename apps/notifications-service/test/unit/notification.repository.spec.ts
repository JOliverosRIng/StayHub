import { PrismaNotificationRepository } from '../../src/infrastructure/persistence/prisma/notification.repository';

describe('notification repository (NTF-005)', () => {
  it('returns a unique-key winner on a concurrent insert conflict', async () => {
    const existing = { id: 'n1', idempotencyKey: 'key1', createdAt: new Date(), sentAt: null };
    const prisma = {
      notification: {
        create: jest.fn().mockRejectedValue({ code: 'P2002' }),
        findUnique: jest.fn().mockResolvedValue(existing),
      },
    };
    const repository = new PrismaNotificationRepository(prisma as never);
    const result = await repository.findByIdempotencyKeyOrCreate({ idempotencyKey: 'key1' } as never);
    expect(result.created).toBe(false);
    expect(result.record.id).toBe('n1');
  });
});
