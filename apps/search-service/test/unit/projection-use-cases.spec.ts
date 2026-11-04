import type { ProjectionUnitOfWorkPort } from '../../src/application/ports/projection-unit-of-work.port';
import { ProjectionReplayConflictError } from '../../src/application/projections/projection-errors';
import { projectionPayloadHash } from '../../src/application/projections/projection-payload-hash';
import { RemoveProjection } from '../../src/application/projections/remove-projection.use-case';
import { UpsertProjection } from '../../src/application/projections/upsert-projection.use-case';
import {
  removedProjectionEventFixture,
  upsertedProjectionEventFixture,
} from '../fixtures/projection-events.fixture';

describe('projection use cases', () => {
  it('calculates canonical SHA-256 independently of object key order', () => {
    expect(projectionPayloadHash({ b: 2, a: { d: 4, c: 3 } })).toBe(
      projectionPayloadHash({ a: { c: 3, d: 4 }, b: 2 }),
    );
    expect(projectionPayloadHash({ a: 1 })).toMatch(/^[a-f0-9]{64}$/u);
  });

  it.each(['APPLIED', 'IGNORED_STALE'] as const)(
    'returns the unit-of-work outcome for upsert: %s',
    async (outcome) => {
      const apply: jest.MockedFunction<ProjectionUnitOfWorkPort['apply']> =
        jest.fn().mockResolvedValue(outcome);
      const unitOfWork: jest.Mocked<ProjectionUnitOfWorkPort> = { apply };
      await expect(
        new UpsertProjection(unitOfWork).execute(upsertedProjectionEventFixture),
      ).resolves.toBe(outcome);
      const command = apply.mock.calls[0]?.[0];
      expect(command?.kind).toBe('UPSERT');
      expect(command?.projectionVersion).toBe(1n);
      expect(command?.payloadHash).toMatch(/^[a-f0-9]{64}$/u);
    },
  );

  it('treats an identical replay as idempotent success', async () => {
    const apply: jest.MockedFunction<ProjectionUnitOfWorkPort['apply']> =
      jest.fn().mockResolvedValue('APPLIED');
    const useCase = new UpsertProjection({ apply });
    await expect(useCase.execute(upsertedProjectionEventFixture)).resolves.toBe(
      'APPLIED',
    );
    await expect(useCase.execute(upsertedProjectionEventFixture)).resolves.toBe(
      'APPLIED',
    );
    const first = apply.mock.calls[0]?.[0];
    const second = apply.mock.calls[1]?.[0];
    expect(first?.payloadHash).toBe(second?.payloadHash);
  });

  it('propagates a conflicting replay without converting it to success', async () => {
    const conflict = new ProjectionReplayConflictError('eventId reused');
    const apply: jest.MockedFunction<ProjectionUnitOfWorkPort['apply']> =
      jest.fn().mockRejectedValue(conflict);
    await expect(
      new UpsertProjection({ apply }).execute(upsertedProjectionEventFixture),
    ).rejects.toBe(conflict);
  });

  it('builds a monotonic removal command', async () => {
    const apply: jest.MockedFunction<ProjectionUnitOfWorkPort['apply']> =
      jest.fn().mockResolvedValue('REMOVED');
    await expect(
      new RemoveProjection({ apply }).execute(removedProjectionEventFixture),
    ).resolves.toBe('REMOVED');
    expect(apply).toHaveBeenCalledWith(
      expect.objectContaining({
        kind: 'REMOVE',
        accommodationId: removedProjectionEventFixture.accommodationId,
        projectionVersion: 2n,
      }),
    );
  });
});
