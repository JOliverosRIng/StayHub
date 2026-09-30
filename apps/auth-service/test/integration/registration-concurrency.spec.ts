import { randomUUID } from 'node:crypto';

import { Registration } from '@auth/domain/registrations/registration';
import { PrismaRegistrationWork } from '@auth/infrastructure/persistence/prisma/registration.repository';
import { PrismaService } from '@auth/infrastructure/persistence/prisma/prisma.service';
import { createIntegrationDependencies, type IntegrationDependencies } from './dependencies.setup';

const NOW = new Date('2026-09-28T12:00:00.000Z');
const LEASE_MS = 120_000;
const EXPIRES_MS = 900_000;

function fingerprint(seed: string): string {
  return seed.repeat(64).slice(0, 64);
}

describe('registration concurrency (AUTH-030)', () => {
  let dependencies: IntegrationDependencies;
  let primary: PrismaService;
  let secondary: PrismaService;
  let workA: PrismaRegistrationWork;
  let workB: PrismaRegistrationWork;

  beforeAll(async () => {
    dependencies = await createIntegrationDependencies();
    const databaseUrl = process.env.TEST_AUTH_DATABASE_URL as string;
    primary = new PrismaService({ datasources: { db: { url: databaseUrl } } });
    secondary = new PrismaService({ datasources: { db: { url: databaseUrl } } });
    await Promise.all([primary.$connect(), secondary.$connect()]);
    workA = new PrismaRegistrationWork(primary);
    workB = new PrismaRegistrationWork(secondary);
  });

  afterAll(async () => {
    await Promise.all([primary.$disconnect(), secondary.$disconnect()]);
    await dependencies.close();
  });

  beforeEach(async () => {
    await dependencies.clean();
  });

  function registration(id: string, userId: string, print = fingerprint('a')): Registration {
    return Registration.create(id, print, userId, NOW, new Date(NOW.getTime() + EXPIRES_MS));
  }

  function leaseUntil(offsetMillis = LEASE_MS): Date {
    return new Date(NOW.getTime() + offsetMillis);
  }

  it('creates exactly one row for a first-time registration claimed by two connections', async () => {
    expect(await dependencies.prisma.registration.count()).toBe(0);
    const id = randomUUID();
    const candidateA = randomUUID();
    const candidateB = randomUUID();
    const print = fingerprint('a');

    const [first, second] = await Promise.all([
      workA.createOrRead(registration(id, candidateA, print)),
      workB.createOrRead(registration(id, candidateB, print)),
    ]);

    expect(await dependencies.prisma.registration.count()).toBe(1);
    expect(first.snapshot().id).toBe(id);
    expect(second.snapshot().id).toBe(id);
    expect(first.snapshot().userId).toBe(second.snapshot().userId);
    expect([candidateA, candidateB]).toContain(first.snapshot().userId);
    const persisted = await dependencies.prisma.registration.findUnique({ where: { id } });
    expect(persisted?.requestFingerprint).toBe(print);
  });

  it('keeps the same winner and fingerprint when the key is replayed concurrently with different fingerprints', async () => {
    const id = randomUUID();
    const winner = randomUUID();
    const original = fingerprint('b');
    await workA.createOrRead(registration(id, winner, original));

    const [replayA, replayB] = await Promise.all([
      workA.createOrRead(registration(id, randomUUID(), fingerprint('c'))),
      workB.createOrRead(registration(id, randomUUID(), fingerprint('d'))),
    ]);

    expect(replayA.snapshot().requestFingerprint).toBe(original);
    expect(replayB.snapshot().requestFingerprint).toBe(original);
    expect(replayA.snapshot().userId).toBe(winner);
    expect(replayB.snapshot().userId).toBe(winner);
    expect(await dependencies.prisma.registration.count()).toBe(1);
  });

  it('does not overwrite a credential already attached to the winning registration', async () => {
    const id = randomUUID();
    const winner = randomUUID();
    const print = fingerprint('a');
    await workA.createOrRead(registration(id, winner, print));
    await dependencies.prisma.credential.create({
      data: { userId: winner, passwordHash: 'winner-hash', status: 'ACTIVE' },
    });

    const replay = await workB.createOrRead(registration(id, randomUUID(), print));

    expect(replay.snapshot().userId).toBe(winner);
    expect(await dependencies.prisma.credential.count()).toBe(1);
    const credential = await dependencies.prisma.credential.findUnique({ where: { userId: winner } });
    expect(credential?.passwordHash).toBe('winner-hash');
    expect(credential?.status).toBe('ACTIVE');
  });

  it('grants a concurrent claim to exactly one owner', async () => {
    const id = randomUUID();
    await workA.createOrRead(registration(id, randomUUID()));

    const [first, second] = await Promise.all([
      workA.claimOne(id, randomUUID(), NOW, leaseUntil()),
      workB.claimOne(id, randomUUID(), NOW, leaseUntil()),
    ]);

    expect([first.status, second.status].sort()).toEqual(['busy', 'claimed']);
  });

  it('recovers an expired lease for a fresh owner and rejects the stale owner', async () => {
    const id = randomUUID();
    const staleOwner = randomUUID();
    await workA.createOrRead(registration(id, randomUUID()));
    await dependencies.prisma.registration.update({
      where: { id },
      data: { processingOwner: staleOwner, leaseUntil: new Date(NOW.getTime() - 1_000) },
    });

    const reclaimed = await workB.claimOne(id, randomUUID(), NOW, leaseUntil());

    expect(reclaimed.status).toBe('claimed');
    expect(
      await workA.renew(id, staleOwner, new Date(NOW.getTime() + 1_000), leaseUntil(LEASE_MS + 1_000)),
    ).toBeNull();
    expect(await workA.release(id, staleOwner, new Date(NOW.getTime() + 1_000))).toBe(false);
  });

  it('returns disjoint batches to two concurrent workers', async () => {
    const ids = Array.from({ length: 6 }, () => randomUUID());
    for (const id of ids) {
      await workA.createOrRead(registration(id, randomUUID()));
    }

    const [batchA, batchB] = await Promise.all([
      workA.claimBatch(randomUUID(), NOW, 3, leaseUntil()),
      workB.claimBatch(randomUUID(), NOW, 3, leaseUntil()),
    ]);

    const idsA = batchA.map((item) => item.snapshot().id);
    const idsB = batchB.map((item) => item.snapshot().id);
    const intersection = idsA.filter((id) => idsB.includes(id));

    expect(idsA.length).toBeGreaterThan(0);
    expect(idsA.length).toBeLessThanOrEqual(3);
    expect(idsB.length).toBeLessThanOrEqual(3);
    expect(intersection).toEqual([]);
    expect(new Set([...idsA, ...idsB]).size).toBe(6);
  });

  it('never claims terminal registrations', async () => {
    const id = randomUUID();
    await workA.createOrRead(registration(id, randomUUID()));
    await dependencies.prisma.registration.update({ where: { id }, data: { state: 'COMPLETED' } });

    const result = await workB.claimOne(id, randomUUID(), NOW, leaseUntil());

    expect(result.status).toBe('terminal');
  });
});
