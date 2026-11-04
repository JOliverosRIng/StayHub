import { randomUUID } from 'node:crypto';
import { PrismaClient } from '../../src/infrastructure/persistence/generated/client';
import { PrismaProjectionUnitOfWorkAdapter } from '../../src/infrastructure/persistence/prisma/projection-unit-of-work.adapter';
import type { PrismaService } from '../../src/infrastructure/persistence/prisma/prisma.service';
import { ProjectionReplayConflictError } from '../../src/application/projections/projection-errors';
import { RemoveProjection } from '../../src/application/projections/remove-projection.use-case';
import { UpsertProjection } from '../../src/application/projections/upsert-projection.use-case';
import type {
  RemovedProjectionEventDto,
  UpsertedProjectionEventDto,
} from '../../src/interfaces/events/projection-event.dto';
import { upsertedProjectionEventFixture } from '../fixtures/projection-events.fixture';
import {
  describeWithPostgres,
  searchTestDatabaseUrl,
} from '../helpers/dependencies';

function upsertEvent(
  version: number,
  overrides: Partial<UpsertedProjectionEventDto['data']> = {},
): UpsertedProjectionEventDto {
  return {
    ...upsertedProjectionEventFixture,
    eventId: randomUUID(),
    projectionVersion: version,
    data: {
      ...upsertedProjectionEventFixture.data,
      sourceUpdatedAt: `2026-11-${String(version).padStart(2, '0')}T00:00:00Z`,
      ...overrides,
    },
  };
}

function removeEvent(version: number): RemovedProjectionEventDto {
  return {
    eventId: randomUUID(),
    eventType: 'accommodation.search.v1.removed',
    schemaVersion: 1,
    occurredAt: '2026-11-20T00:00:00Z',
    accommodationId: upsertedProjectionEventFixture.accommodationId,
    projectionVersion: version,
  };
}

describeWithPostgres('Prisma projection unit of work', () => {
  const prisma = new PrismaClient({ datasourceUrl: searchTestDatabaseUrl! });
  const adapter = new PrismaProjectionUnitOfWorkAdapter(
    prisma as unknown as PrismaService,
  );
  const upsert = new UpsertProjection(adapter);
  const remove = new RemoveProjection(adapter);

  beforeAll(async () => prisma.$connect());
  beforeEach(async () => {
    await prisma.$executeRawUnsafe(
      'TRUNCATE availability_windows, processed_projection_events, projection_cursors, search_documents CASCADE',
    );
    await prisma.searchIndexState.update({
      where: { id: 1 },
      data: { cacheGeneration: 0n },
    });
  });
  afterAll(async () => prisma.$disconnect());

  it('commits event, document, windows, cursor and visible cache generation atomically', async () => {
    const event = upsertEvent(1);
    await expect(upsert.execute(event)).resolves.toBe('APPLIED');
    await expect(
      prisma.searchDocument.findUnique({
        where: { accommodationId: event.accommodationId },
        include: { availability: true },
      }),
    ).resolves.toEqual(
      expect.objectContaining({
        name: 'Casa Bogotá',
        projectionVersion: 1n,
        availability: [expect.objectContaining({ projectionVersion: 1n })],
      }),
    );
    await expect(
      prisma.processedProjectionEvent.findUnique({
        where: { eventId: event.eventId },
      }),
    ).resolves.toEqual(expect.objectContaining({ outcome: 'APPLIED' }));
    await expect(
      prisma.searchIndexState.findUnique({ where: { id: 1 } }),
    ).resolves.toEqual(expect.objectContaining({ cacheGeneration: 1n }));
  });

  it('makes identical replay idempotent and rejects conflicting eventId reuse', async () => {
    const event = upsertEvent(1);
    await expect(upsert.execute(event)).resolves.toBe('APPLIED');
    await expect(upsert.execute(event)).resolves.toBe('APPLIED');
    expect(await prisma.processedProjectionEvent.count()).toBe(1);
    expect((await prisma.searchIndexState.findUnique({ where: { id: 1 } }))?.cacheGeneration).toBe(1n);
    await expect(
      upsert.execute({ ...event, data: { ...event.data, name: 'Otro nombre' } }),
    ).rejects.toBeInstanceOf(ProjectionReplayConflictError);
    expect((await prisma.searchDocument.findUnique({ where: { accommodationId: event.accommodationId } }))?.name).toBe('Casa Bogotá');
  });

  it('ignores stale events and only increments generation for visible mutations', async () => {
    await expect(upsert.execute(upsertEvent(2))).resolves.toBe('APPLIED');
    await expect(upsert.execute(upsertEvent(1, { name: 'Stale' }))).resolves.toBe('IGNORED_STALE');
    expect((await prisma.searchDocument.findFirst())?.name).toBe('Casa Bogotá');
    expect((await prisma.searchIndexState.findUnique({ where: { id: 1 } }))?.cacheGeneration).toBe(1n);
  });

  it('does not invalidate public cache for mutations that remain unpublished', async () => {
    await expect(
      upsert.execute(upsertEvent(1, { published: false })),
    ).resolves.toBe('APPLIED');
    await expect(
      upsert.execute(upsertEvent(2, { published: false, name: 'Privada' })),
    ).resolves.toBe('APPLIED');
    expect(
      (await prisma.searchIndexState.findUnique({ where: { id: 1 } }))
        ?.cacheGeneration,
    ).toBe(0n);
    await expect(remove.execute(removeEvent(3))).resolves.toBe('REMOVED');
    expect(
      (await prisma.searchIndexState.findUnique({ where: { id: 1 } }))
        ?.cacheGeneration,
    ).toBe(0n);
  });

  it('replaces availability as a complete snapshot', async () => {
    await upsert.execute(upsertEvent(1));
    await upsert.execute(
      upsertEvent(2, {
        availability: [
          { startDate: '2027-01-01', endDate: '2027-01-10', availableCapacity: 2 },
          { startDate: '2027-02-01', endDate: '2027-02-10', availableCapacity: 3 },
        ],
      }),
    );
    const windows = await prisma.availabilityWindow.findMany({
      orderBy: { startDate: 'asc' },
    });
    expect(windows).toHaveLength(2);
    expect(windows.every((window) => window.projectionVersion === 2n)).toBe(true);
  });

  it('keeps a removal tombstone that prevents resurrection by an older version', async () => {
    await upsert.execute(upsertEvent(3));
    await expect(remove.execute(removeEvent(5))).resolves.toBe('REMOVED');
    await expect(upsert.execute(upsertEvent(4))).resolves.toBe('IGNORED_STALE');
    await expect(prisma.searchDocument.findFirst()).resolves.toBeNull();
    await expect(prisma.projectionCursor.findFirst()).resolves.toEqual(
      expect.objectContaining({ projectionVersion: 5n, removed: true }),
    );
  });

  it('rolls back event and cursor when document persistence fails', async () => {
    const event = upsertEvent(1, { minNightlyPrice: 1e20 });
    await expect(upsert.execute(event)).rejects.toBeDefined();
    expect(await prisma.processedProjectionEvent.count()).toBe(0);
    expect(await prisma.projectionCursor.count()).toBe(0);
    expect(await prisma.searchDocument.count()).toBe(0);
  });

  it('serializes concurrent versions per accommodation', async () => {
    const outcomes = await Promise.all([
      upsert.execute(upsertEvent(10, { name: 'Version 10' })),
      upsert.execute(upsertEvent(11, { name: 'Version 11' })),
    ]);
    expect(outcomes).toEqual(expect.arrayContaining(['APPLIED']));
    await expect(prisma.searchDocument.findFirst()).resolves.toEqual(
      expect.objectContaining({ name: 'Version 11', projectionVersion: 11n }),
    );
  });
});
