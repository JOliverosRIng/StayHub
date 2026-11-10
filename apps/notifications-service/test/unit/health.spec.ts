import { ServiceUnavailableException } from '@nestjs/common';
import { HealthController } from '../../src/interfaces/http/health.controller';
import type { PrismaService } from '../../src/infrastructure/persistence/prisma/prisma.service';

describe('notification readiness', () => {
  it('requires both notification and reminder storage to be available', async () => {
    const query = jest.fn().mockResolvedValueOnce([]).mockRejectedValueOnce(new Error('table missing'));
    const controller = new HealthController({ $queryRaw: query } as unknown as PrismaService);
    await expect(controller.ready()).rejects.toBeInstanceOf(ServiceUnavailableException);
    expect(query).toHaveBeenCalledTimes(2);
  });

  it('reports ready with an empty migrated database', async () => {
    const controller = new HealthController({ $queryRaw: jest.fn().mockResolvedValue([]) } as unknown as PrismaService);
    await expect(controller.ready()).resolves.toEqual({ status: 'ok' });
  });
});
