import { HealthController } from '@reviews/modules/health/health.controller';
describe('runtime readiness', () => {
  it('queries the persistence readiness gate', async () => { const prisma = { isReady: jest.fn(async () => true) }; await expect(new HealthController(prisma as never).ready()).resolves.toMatchObject({ status: 'ready' }); expect(prisma.isReady).toHaveBeenCalledTimes(1); });
});
