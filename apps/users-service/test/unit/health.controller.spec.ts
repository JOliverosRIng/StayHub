import { HttpStatus, ServiceUnavailableException } from '@nestjs/common';

import type { PrismaService } from '@users/infrastructure/persistence/prisma/prisma.service';
import { HealthController } from '@users/modules/health/health.controller';
import type { MigrationSource } from '@users/modules/health/migration-source';

interface ProbeState {
  reachable: boolean;
  applied: readonly string[] | Error;
  expected: readonly string[];
}

function controllerFor(state: ProbeState): HealthController {
  const prisma = {
    isReachable: jest.fn(() => Promise.resolve(state.reachable)),
    appliedMigrationNames: jest.fn(() =>
      state.applied instanceof Error ? Promise.reject(state.applied) : Promise.resolve(state.applied),
    ),
  } as unknown as PrismaService;
  const migrations: MigrationSource = {
    expectedMigrations: () => Promise.resolve(state.expected),
  };
  return new HealthController(prisma, migrations);
}

async function expectUnavailable(promise: Promise<unknown>): Promise<void> {
  await expect(promise).rejects.toBeInstanceOf(ServiceUnavailableException);
  await promise.catch((error: ServiceUnavailableException) => {
    expect(error.getStatus()).toBe(HttpStatus.SERVICE_UNAVAILABLE);
  });
}

describe('HealthController', () => {
  it('reports liveness without touching dependencies', () => {
    const controller = controllerFor({ reachable: false, applied: [], expected: [] });
    expect(controller.live()).toEqual({ status: 'ok' });
  });

  it('is ready when users_db is reachable and every local migration is applied', async () => {
    const controller = controllerFor({
      reachable: true,
      applied: ['20260101000000_create_users', '20260201000000_add_profile_photo'],
      expected: ['20260101000000_create_users', '20260201000000_add_profile_photo'],
    });
    await expect(controller.ready()).resolves.toEqual({ status: 'ready' });
  });

  it('is not ready when users_db is unreachable', async () => {
    const controller = controllerFor({ reachable: false, applied: [], expected: [] });
    await expectUnavailable(controller.ready());
  });

  it('is not ready while a local migration is pending', async () => {
    const controller = controllerFor({
      reachable: true,
      applied: ['20260101000000_create_users'],
      expected: ['20260101000000_create_users', '20260201000000_add_profile_photo'],
    });
    await expectUnavailable(controller.ready());
  });

  it('is not ready when migration state cannot be read', async () => {
    const controller = controllerFor({
      reachable: true,
      applied: new Error('permission denied'),
      expected: ['20260101000000_create_users'],
    });
    await expectUnavailable(controller.ready());
  });
});
