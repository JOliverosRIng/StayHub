import { randomUUID } from 'node:crypto';

import type { PasswordHasher } from '@auth/application/ports/password-hasher.port';
import { AdvanceRegistrationService } from '@auth/application/registration/advance-registration.service';
import {
  ReconcileRegistrationsUseCase,
  type ReconcileRegistrations,
  type ReconcileTickResult,
} from '@auth/application/registration/reconcile-registrations.use-case';
import type { RegistrationState } from '@auth/domain/registrations/registration';
import { UsersRegistrationClient } from '@auth/infrastructure/http/users-registration.client';
import { UsersServiceClient } from '@auth/infrastructure/http/users-service.client';
import { AuthLogger } from '@auth/infrastructure/observability/auth-logger';
import { PrismaRegistrationWork } from '@auth/infrastructure/persistence/prisma/registration.repository';
import { PrismaService } from '@auth/infrastructure/persistence/prisma/prisma.service';
import { UsersServiceTokenProvider } from '@auth/infrastructure/security/users-service-token.provider';
import { RegistrationReconcilerService } from '@auth/modules/registration/registration-reconciler.service';
import { createAuthCryptoFixture, type AuthCryptoFixture } from '../helpers/crypto-fixture';
import { FakeClock } from '../helpers/fake-clock';
import { UsersStub, type UsersStubStatus } from '../helpers/users-stub';
import { createIntegrationDependencies, type IntegrationDependencies } from './dependencies.setup';

const START = new Date('2026-09-28T12:00:00.000Z');
const TTL_SECONDS = 900;
const LEASE_SECONDS = 120;
const INTERVAL_SECONDS = 30;
const BATCH_SIZE = 50;
const MAX_ATTEMPTS = 5;
const FINGERPRINT = 'a'.repeat(64);

const hasher: PasswordHasher = {
  hash: (password: string): Promise<string> => Promise.resolve(`hashed:${password}`),
  verify: (hash: string, password: string): Promise<boolean> =>
    Promise.resolve(hash === `hashed:${password}`),
  verifyWithEquivalentCost: (hash: string | null, password: string): Promise<boolean> =>
    Promise.resolve(hash === `hashed:${password}`),
};

let dependencies: IntegrationDependencies;

interface SeededRegistration {
  readonly registrationId: string;
  readonly userId: string;
}

interface SeedOptions {
  readonly state?: RegistrationState;
  readonly attemptCount?: number;
  readonly expiresAt?: Date;
  readonly nextAttemptAt?: Date;
}

async function seedRegistration(options: SeedOptions = {}): Promise<SeededRegistration> {
  const registrationId = randomUUID();
  const userId = randomUUID();
  await dependencies.prisma.registration.create({
    data: {
      id: registrationId,
      requestFingerprint: FINGERPRINT,
      userId,
      state: options.state ?? 'STARTED',
      attemptCount: options.attemptCount ?? 0,
      expiresAt: options.expiresAt ?? new Date(START.getTime() + TTL_SECONDS * 1000),
      nextAttemptAt: options.nextAttemptAt ?? new Date(START.getTime() - 1_000),
      createdAt: new Date(START.getTime() - 60_000),
    },
  });
  return { registrationId, userId };
}

async function seedCredential(userId: string, status: 'PENDING' | 'ACTIVE'): Promise<void> {
  await dependencies.prisma.credential.create({
    data: { userId, passwordHash: 'hashed:Correct-Horse-42', status },
  });
}

let stub: UsersStub;

function stubUser(seeded: SeededRegistration, status: UsersStubStatus): void {
  stub.seed({
    registrationId: seeded.registrationId,
    userId: seeded.userId,
    name: 'Jane Guest',
    email: `${seeded.registrationId}@example.test`,
    role: 'GUEST',
    status,
  });
}

describe('registration reconciler (AUTH-043)', () => {
  let primary: PrismaService;
  let work: PrismaRegistrationWork;
  let fixture: AuthCryptoFixture;
  let clock: FakeClock;
  let adapter: UsersRegistrationClient;

  beforeAll(async () => {
    dependencies = await createIntegrationDependencies();
    const databaseUrl = process.env.TEST_AUTH_DATABASE_URL as string;
    primary = new PrismaService({ datasources: { db: { url: databaseUrl } } });
    await primary.$connect();
    work = new PrismaRegistrationWork(primary);
    stub = new UsersStub();
    const baseUrl = await stub.start();
    fixture = createAuthCryptoFixture({
      usersServiceUrl: baseUrl,
      usersTimeoutMs: 2_000,
      usersCircuitFailureThreshold: 100,
    });
  });

  afterAll(async () => {
    await stub.stop();
    await primary.$disconnect();
    await dependencies.close();
  });

  beforeEach(async () => {
    await dependencies.clean();
    stub.reset();
    clock = new FakeClock(START);
    const tokens = new UsersServiceTokenProvider(fixture.config, clock, { generate: randomUUID });
    adapter = new UsersRegistrationClient(new UsersServiceClient(fixture.config, tokens));
  });

  function reconciler(): ReconcileRegistrationsUseCase {
    const advance = new AdvanceRegistrationService(work, adapter, hasher, clock);
    return new ReconcileRegistrationsUseCase(
      work,
      advance,
      adapter,
      clock,
      { generate: randomUUID },
      {
        batchSize: BATCH_SIZE,
        maxAttempts: MAX_ATTEMPTS,
        intervalSeconds: INTERVAL_SECONDS,
        leaseSeconds: LEASE_SECONDS,
      },
    );
  }

  async function stateOf(registrationId: string): Promise<string | null> {
    const row = await dependencies.prisma.registration.findUnique({ where: { id: registrationId } });
    return row?.state ?? null;
  }

  it('completes when both sides are ACTIVE even after the local TTL expired', async () => {
    const seeded = await seedRegistration({
      state: 'CREDENTIAL_ACTIVE',
      expiresAt: new Date(START.getTime() - 1_000),
    });
    await seedCredential(seeded.userId, 'PENDING');
    stubUser(seeded, 'ACTIVE');

    const result = await reconciler().execute();

    expect(result.completed).toBe(1);
    expect(await stateOf(seeded.registrationId)).toBe('COMPLETED');
    const credential = await dependencies.prisma.credential.findUnique({
      where: { userId: seeded.userId },
    });
    expect(credential?.status).toBe('ACTIVE');
  });

  it('advances a PENDING user that already has a stored hash', async () => {
    const seeded = await seedRegistration({ state: 'USER_PENDING' });
    await seedCredential(seeded.userId, 'PENDING');
    stubUser(seeded, 'PENDING');

    await reconciler().execute();

    expect(await stateOf(seeded.registrationId)).toBe('COMPLETED');
    expect(stub.find(seeded.registrationId)?.status).toBe('ACTIVE');
    const credential = await dependencies.prisma.credential.findUnique({
      where: { userId: seeded.userId },
    });
    expect(credential?.status).toBe('ACTIVE');
  });

  it('waits without counting attempts while the payload is missing and compensates after TTL', async () => {
    const seeded = await seedRegistration({ state: 'USER_PENDING' });
    stubUser(seeded, 'PENDING');

    await reconciler().execute();
    let row = await dependencies.prisma.registration.findUnique({
      where: { id: seeded.registrationId },
    });
    expect(row?.state).toBe('USER_PENDING');
    expect(row?.attemptCount).toBe(0);
    expect(row === null ? 0 : row.nextAttemptAt.getTime() - START.getTime()).toBe(
      INTERVAL_SECONDS * 1000,
    );

    clock.advanceSeconds(INTERVAL_SECONDS + 1);
    await reconciler().execute();
    row = await dependencies.prisma.registration.findUnique({ where: { id: seeded.registrationId } });
    expect(row?.attemptCount).toBe(0);

    clock.set(new Date(START.getTime() + TTL_SECONDS * 1000 + 1));
    await reconciler().execute();
    expect(await stateOf(seeded.registrationId)).toBe('CANCELLED');
  });

  it('revokes the credential when Users reports CANCELLED', async () => {
    const seeded = await seedRegistration({ state: 'CREDENTIAL_ACTIVE' });
    await seedCredential(seeded.userId, 'ACTIVE');
    stubUser(seeded, 'CANCELLED');

    await reconciler().execute();

    expect(await stateOf(seeded.registrationId)).toBe('CANCELLED');
    const credential = await dependencies.prisma.credential.findUnique({
      where: { userId: seeded.userId },
    });
    expect(credential?.status).toBe('REVOKED');
  });

  it('keeps COMPENSATING when cancellation cannot be confirmed', async () => {
    const seeded = await seedRegistration({ state: 'COMPENSATING' });
    await seedCredential(seeded.userId, 'ACTIVE');
    stubUser(seeded, 'PENDING');
    stub.failNext({ methods: ['POST'], pathEndsWith: '/cancel', mode: 'before', status: 503 });
    stub.failNext({ methods: ['POST'], pathEndsWith: '/cancel', mode: 'before', status: 503 });

    await reconciler().execute();

    expect(await stateOf(seeded.registrationId)).toBe('COMPENSATING');
    const credential = await dependencies.prisma.credential.findUnique({
      where: { userId: seeded.userId },
    });
    expect(credential?.status).toBe('ACTIVE');

    await reconciler().execute();
    expect(await stateOf(seeded.registrationId)).toBe('CANCELLED');
  });

  it('cancels when Users confirms that the identity was never created', async () => {
    const seeded = await seedRegistration({ state: 'COMPENSATING' });

    await reconciler().execute();

    expect(await stateOf(seeded.registrationId)).toBe('CANCELLED');
  });

  it('keeps COMPENSATING when the absence cannot be confirmed', async () => {
    const seeded = await seedRegistration({ state: 'COMPENSATING' });
    stub.failNext({ methods: ['GET'], pathEndsWith: seeded.registrationId, mode: 'before', status: 503 });
    stub.failNext({ methods: ['GET'], pathEndsWith: seeded.registrationId, mode: 'before', status: 503 });

    await reconciler().execute();
    expect(await stateOf(seeded.registrationId)).toBe('COMPENSATING');

    await reconciler().execute();
    expect(await stateOf(seeded.registrationId)).toBe('CANCELLED');
  });

  it('completes when compensation finds an ACTIVE user behind the conflict', async () => {
    const seeded = await seedRegistration({ state: 'COMPENSATING' });
    await seedCredential(seeded.userId, 'PENDING');
    stubUser(seeded, 'ACTIVE');

    await reconciler().execute();

    expect(await stateOf(seeded.registrationId)).toBe('COMPLETED');
    const credential = await dependencies.prisma.credential.findUnique({
      where: { userId: seeded.userId },
    });
    expect(credential?.status).toBe('ACTIVE');
  });

  it('applies 30/60/120/240 backoff and moves to compensation at the fifth failure', async () => {
    const seeded = await seedRegistration({ state: 'CREDENTIAL_ACTIVE' });
    await seedCredential(seeded.userId, 'ACTIVE');
    stubUser(seeded, 'PENDING');
    const expected = [30, 60, 120, 240];

    for (let index = 0; index < expected.length; index += 1) {
      stub.failNext({ methods: ['POST'], pathEndsWith: '/activate', mode: 'before', status: 503 });
      stub.failNext({ methods: ['POST'], pathEndsWith: '/activate', mode: 'before', status: 503 });
      const now = clock.now();
      await reconciler().execute();
      const row = await dependencies.prisma.registration.findUnique({
        where: { id: seeded.registrationId },
      });
      const seconds = expected[index] ?? 30;
      expect(row?.attemptCount).toBe(index + 1);
      expect(row === null ? 0 : row.nextAttemptAt.getTime() - now.getTime()).toBe(seconds * 1000);
      clock.advanceSeconds(seconds);
    }

    stub.failNext({ methods: ['POST'], pathEndsWith: '/activate', mode: 'before', status: 503 });
    stub.failNext({ methods: ['POST'], pathEndsWith: '/activate', mode: 'before', status: 503 });
    await reconciler().execute();

    expect(await stateOf(seeded.registrationId)).toBe('CANCELLED');
  });

  it('does not touch a row whose nextAttemptAt is in the future', async () => {
    const seeded = await seedRegistration({
      state: 'USER_PENDING',
      nextAttemptAt: new Date(START.getTime() + 600_000),
    });
    await seedCredential(seeded.userId, 'PENDING');

    const result = await reconciler().execute();

    expect(result.claimed).toBe(0);
    const row = await dependencies.prisma.registration.findUnique({
      where: { id: seeded.registrationId },
    });
    expect(row?.attemptCount).toBe(0);
    expect(row?.state).toBe('USER_PENDING');
  });

  it('processes disjoint sets with two concurrent reconcilers', async () => {
    const registrations: string[] = [];
    for (let index = 0; index < 6; index += 1) {
      const seeded = await seedRegistration({ state: 'USER_PENDING' });
      await seedCredential(seeded.userId, 'PENDING');
      stubUser(seeded, 'PENDING');
      registrations.push(seeded.registrationId);
    }

    await Promise.all([reconciler().execute(), reconciler().execute()]);

    const rows = await dependencies.prisma.registration.findMany({
      where: { id: { in: registrations } },
    });
    expect(rows).toHaveLength(6);
    expect(rows.every((row) => row.state === 'COMPLETED')).toBe(true);
    expect(stub.requests.filter((request) => request.path.endsWith('/activate'))).toHaveLength(6);
  });

  it('cancels the scheduler on module destroy without leaving handles', async () => {
    jest.useFakeTimers();
    try {
      const execute = jest
        .fn<Promise<ReconcileTickResult>, []>()
        .mockResolvedValue({ claimed: 0, completed: 0, waiting: 0, compensating: 0 });
      const reconcile: ReconcileRegistrations = { execute };
      const scheduler = new RegistrationReconcilerService(
        reconcile,
        fixture.config,
        new AuthLogger(),
      );

      scheduler.onModuleInit();
      await jest.advanceTimersByTimeAsync(INTERVAL_SECONDS * 1000);
      expect(execute).toHaveBeenCalledTimes(1);
      await jest.advanceTimersByTimeAsync(INTERVAL_SECONDS * 1000);
      expect(execute).toHaveBeenCalledTimes(2);

      scheduler.onModuleDestroy();
      await jest.advanceTimersByTimeAsync(INTERVAL_SECONDS * 1000 * 4);
      expect(execute).toHaveBeenCalledTimes(2);
      expect(jest.getTimerCount()).toBe(0);
    } finally {
      jest.useRealTimers();
    }
  });
});
