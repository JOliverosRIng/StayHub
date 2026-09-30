import { randomUUID } from 'node:crypto';

import { Registration } from '@auth/domain/registrations/registration';
import { PrismaRegistrationWork } from '@auth/infrastructure/persistence/prisma/registration.repository';
import { PrismaService } from '@auth/infrastructure/persistence/prisma/prisma.service';
import { createIntegrationDependencies, type IntegrationDependencies } from './dependencies.setup';

const NOW = new Date('2026-09-28T12:00:00.000Z');
const LEASE_MS = 120_000;
const EXPIRES_MS = 900_000;

describe('PrismaRegistrationWork', () => {
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

  function registration(
    id: string,
    userId: string,
    fingerprint = 'a'.repeat(64),
  ): Registration {
    return Registration.create(id, fingerprint, userId, NOW, new Date(NOW.getTime() + EXPIRES_MS));
  }

  function leaseUntil(offsetMillis = LEASE_MS): Date {
    return new Date(NOW.getTime() + offsetMillis);
  }

  it('reports readiness when the expected migrations are applied', async () => {
    expect(await primary.isReachable()).toBe(true);
    expect(await primary.hasAppliedMigrations()).toBe(true);
  });

  it('claims a row for exactly one owner across two connections', async () => {
    const id = randomUUID();
    const userId = randomUUID();
    await workA.createOrRead(registration(id, userId));

    const [first, second] = await Promise.all([
      workA.claimOne(id, randomUUID(), NOW, leaseUntil()),
      workB.claimOne(id, randomUUID(), NOW, leaseUntil()),
    ]);

    const statuses = [first.status, second.status].sort();
    expect(statuses).toEqual(['busy', 'claimed']);
  });

  it('reclaims a row whose lease has expired', async () => {
    const id = randomUUID();
    const userId = randomUUID();
    await workA.createOrRead(registration(id, userId));
    await dependencies.prisma.registration.update({
      where: { id },
      data: {
        processingOwner: randomUUID(),
        leaseUntil: new Date(NOW.getTime() - 1000),
      },
    });

    const result = await workB.claimOne(id, randomUUID(), NOW, leaseUntil());

    expect(result.status).toBe('claimed');
  });

  it('does not advance or release from a previous owner', async () => {
    const id = randomUUID();
    const userId = randomUUID();
    const ownerA = randomUUID();
    const ownerB = randomUUID();
    await workA.createOrRead(registration(id, userId));
    await workA.claimOne(id, ownerA, NOW, leaseUntil());

    const renewedA = await workA.renew(id, ownerA, NOW, leaseUntil(LEASE_MS + 1000));
    expect(renewedA).not.toBeNull();

    await dependencies.prisma.registration.update({
      where: { id },
      data: { processingOwner: ownerB },
    });

    expect(await workA.renew(id, ownerA, new Date(NOW.getTime() + 3000), leaseUntil(LEASE_MS + 3000))).toBeNull();
    expect(await workA.release(id, ownerA, new Date(NOW.getTime() + 3000))).toBe(false);
    expect(
      await workB.renew(id, ownerB, new Date(NOW.getTime() + 3000), leaseUntil(LEASE_MS + 3000)),
    ).not.toBeNull();
  });

  it('changes credential and registration state together or neither', async () => {
    const id = randomUUID();
    const userId = randomUUID();
    await workA.createOrRead(registration(id, userId));
    await dependencies.prisma.credential.create({
      data: { userId, passwordHash: 'hashed-password', status: 'PENDING' },
    });

    await expect(
      workA.transaction(async (context) => {
        const persisted = await context.registrations.findById(id);
        const credential = await context.credentials.findByUserId(userId);
        if (persisted === null || credential === null) throw new Error('fixture missing');
        persisted.replaceState('CREDENTIAL_ACTIVE', NOW);
        credential.activate(NOW);
        await context.registrations.save(persisted);
        await context.credentials.save(credential);
        throw new Error('rollback-requested');
      }),
    ).rejects.toThrow('rollback-requested');

    const persistedRegistration = await dependencies.prisma.registration.findUnique({ where: { id } });
    const persistedCredential = await dependencies.prisma.credential.findUnique({ where: { userId } });
    expect(persistedRegistration?.state).toBe('STARTED');
    expect(persistedCredential?.status).toBe('PENDING');
  });

  it('creates a single row for an initially absent registration under two connections', async () => {
    const id = randomUUID();
    const userId = randomUUID();

    const [first, second] = await Promise.all([
      workA.createOrRead(registration(id, userId, 'b'.repeat(64))),
      workB.createOrRead(registration(id, userId, 'c'.repeat(64))),
    ]);

    expect(await dependencies.prisma.registration.count()).toBe(1);
    expect(first.snapshot().id).toBe(id);
    expect(second.snapshot().id).toBe(id);
    expect(first.snapshot().requestFingerprint).toBe('b'.repeat(64));
    expect(second.snapshot().requestFingerprint).toBe('b'.repeat(64));
  });

  it('claims a batch and skips rows already leased', async () => {
    const id = randomUUID();
    const userId = randomUUID();
    await workA.createOrRead(registration(id, userId));

    const owner = randomUUID();
    const claimed = await workA.claimBatch(owner, NOW, 10, leaseUntil());
    expect(claimed.map((item) => item.snapshot().id)).toContain(id);

    const claimedAgain = await workB.claimBatch(randomUUID(), NOW, 10, leaseUntil());
    expect(claimedAgain).toHaveLength(0);
  });

  it('reports terminal registrations without claiming them', async () => {
    const id = randomUUID();
    const userId = randomUUID();
    await workA.createOrRead(registration(id, userId));
    await dependencies.prisma.registration.update({ where: { id }, data: { state: 'COMPLETED' } });

    const result = await workA.claimOne(id, randomUUID(), NOW, leaseUntil());
    expect(result.status).toBe('terminal');
  });

  it('reports a missing registration instead of creating one', async () => {
    const result = await workA.claimOne(randomUUID(), randomUUID(), NOW, leaseUntil());
    expect(result.status).toBe('missing');
  });

  it('does not overwrite the winning row on replay with a different fingerprint', async () => {
    const id = randomUUID();
    const userId = randomUUID();
    const created = registration(id, userId, 'd'.repeat(64));
    await workA.createOrRead(created);

    const reused = await workA.createOrRead(registration(id, userId, 'e'.repeat(64)));

    expect(reused.snapshot().requestFingerprint).toBe('d'.repeat(64));
    expect(reused.snapshot().userId).toBe(userId);
  });
});
