import { randomUUID } from 'node:crypto';

import type { RegisterAccountCommand } from '@auth/application/ports/auth-use-cases.port';
import type { PasswordHasher } from '@auth/application/ports/password-hasher.port';
import {
  DependencyUnavailableError,
  IdempotencyConflictError,
  RegistrationConflictError,
} from '@auth/application/errors/auth-errors';
import {
  AdvanceRegistrationService,
  normalizeRegistrationInput,
} from '@auth/application/registration/advance-registration.service';
import { RegisterAccountService } from '@auth/application/registration/register-account.use-case';
import type { RegistrationState } from '@auth/domain/registrations/registration';
import { RegistrationPolicy } from '@auth/domain/registrations/registration-policy';
import { UsersRegistrationClient } from '@auth/infrastructure/http/users-registration.client';
import { UsersServiceClient } from '@auth/infrastructure/http/users-service.client';
import { PrismaRegistrationWork } from '@auth/infrastructure/persistence/prisma/registration.repository';
import { PrismaService } from '@auth/infrastructure/persistence/prisma/prisma.service';
import { UsersServiceTokenProvider } from '@auth/infrastructure/security/users-service-token.provider';
import { createAuthCryptoFixture, type AuthCryptoFixture } from '../helpers/crypto-fixture';
import { FakeClock } from '../helpers/fake-clock';
import { UsersStub, type UsersStubStatus } from '../helpers/users-stub';
import { createIntegrationDependencies, type IntegrationDependencies } from './dependencies.setup';

const START = new Date('2026-09-28T12:00:00.000Z');
const TTL_SECONDS = 900;
const LEASE_SECONDS = 120;
const FINGERPRINT_SECRET = 'test-registration-fingerprint-secret-0123456';

const hasher: PasswordHasher = {
  hash: (password: string): Promise<string> => Promise.resolve(`hashed:${password}`),
  verify: (hash: string, password: string): Promise<boolean> =>
    Promise.resolve(hash === `hashed:${password}`),
  verifyWithEquivalentCost: (hash: string | null, password: string): Promise<boolean> =>
    Promise.resolve(hash === `hashed:${password}`),
};
const policy = new RegistrationPolicy(FINGERPRINT_SECRET);

let dependencies: IntegrationDependencies;

function command(overrides: Partial<RegisterAccountCommand> = {}): RegisterAccountCommand {
  return {
    idempotencyKey: randomUUID(),
    input: {
      name: 'Jane Guest',
      email: 'jane.guest@example.test',
      password: 'Correct-Horse-42',
      role: 'GUEST',
    },
    traceId: 'trace-saga-12345678',
    ...overrides,
  };
}

describe('registration saga (AUTH-042)', () => {
  let primary: PrismaService;
  let work: PrismaRegistrationWork;
  let stub: UsersStub;
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

  function service(): RegisterAccountService {
    const advance = new AdvanceRegistrationService(work, adapter, hasher, clock);
    return new RegisterAccountService({
      work,
      users: adapter,
      policy,
      advance,
      clock,
      uuids: { generate: randomUUID },
      settings: { ttlSeconds: TTL_SECONDS, leaseSeconds: LEASE_SECONDS },
    });
  }

  async function registrationRow(id: string): Promise<{
    state: string;
    processingOwner: string | null;
    lastErrorCode: string | null;
  } | null> {
    return dependencies.prisma.registration.findUnique({
      where: { id },
      select: { state: true, processingOwner: true, lastErrorCode: true },
    });
  }

  async function seed(
    cmd: RegisterAccountCommand,
    state: RegistrationState,
    credentialStatus: 'PENDING' | 'ACTIVE' | null,
    remoteStatus: UsersStubStatus | null,
  ): Promise<string> {
    const userId = randomUUID();
    const fingerprint = policy.fingerprint(normalizeRegistrationInput(cmd.input));
    await dependencies.prisma.registration.create({
      data: {
        id: cmd.idempotencyKey,
        requestFingerprint: fingerprint,
        userId,
        state,
        expiresAt: new Date(START.getTime() + TTL_SECONDS * 1000),
        createdAt: new Date(START.getTime() - 60_000),
      },
    });
    if (credentialStatus !== null) {
      await dependencies.prisma.credential.create({
        data: { userId, passwordHash: `hashed:${cmd.input.password}`, status: credentialStatus },
      });
    }
    if (remoteStatus !== null) {
      stub.seed({
        registrationId: cmd.idempotencyKey,
        userId,
        name: cmd.input.name,
        email: cmd.input.email,
        role: 'GUEST',
        status: remoteStatus,
      });
    }
    return userId;
  }

  it('completes the saga with User ACTIVE, Credential ACTIVE and Registration COMPLETED', async () => {
    const cmd = command();

    const result = await service().execute(cmd);

    expect(stub.find(cmd.idempotencyKey)?.status).toBe('ACTIVE');
    const credential = await dependencies.prisma.credential.findUnique({
      where: { userId: result.id },
    });
    expect(credential?.status).toBe('ACTIVE');
    expect(credential?.passwordHash).toBe(`hashed:${cmd.input.password}`);
    const row = await registrationRow(cmd.idempotencyKey);
    expect(row?.state).toBe('COMPLETED');
    expect(row?.processingOwner).toBeNull();
    expect(Object.keys(result).sort()).toEqual(['email', 'id', 'name', 'role']);
    expect(JSON.stringify(stub.requests)).not.toContain(cmd.input.password);
  });

  it('returns the same identity on repetition without new Users calls', async () => {
    const cmd = command();
    const first = await service().execute(cmd);
    const requestsAfterFirst = stub.requests.length;

    const second = await service().execute(cmd);

    expect(second).toEqual(first);
    expect(stub.requests.length).toBe(requestsAfterFirst + 1);
  });

  it.each<[RegistrationState, 'PENDING' | 'ACTIVE' | null, UsersStubStatus | null]>([
    ['USER_PENDING', 'PENDING', 'PENDING'],
    ['CREDENTIAL_PENDING', 'PENDING', 'PENDING'],
    ['CREDENTIAL_ACTIVE', 'ACTIVE', 'PENDING'],
    ['CREDENTIAL_ACTIVE', 'ACTIVE', 'ACTIVE'],
  ])(
    'resumes from %s without duplicating identity or credential',
    async (state, credentialStatus, remoteStatus) => {
      const cmd = command();
      const userId = await seed(cmd, state, credentialStatus, remoteStatus);

      const result = await service().execute(cmd);

      expect(result.id).toBe(userId);
      expect(stub.find(cmd.idempotencyKey)?.status).toBe('ACTIVE');
      expect(await dependencies.prisma.registration.count()).toBe(1);
      expect(await dependencies.prisma.credential.count()).toBe(1);
      expect((await registrationRow(cmd.idempotencyKey))?.state).toBe('COMPLETED');
    },
  );

  it('returns 503, preserves STARTED and recovers on immediate retry', async () => {
    const cmd = command();
    const createPath = '/internal/v1/registrations';
    stub.failNext({ methods: ['POST'], path: createPath, mode: 'before', status: 503 });
    stub.failNext({ methods: ['POST'], path: createPath, mode: 'before', status: 503 });

    await expect(service().execute(cmd)).rejects.toThrow(DependencyUnavailableError);

    const failed = await registrationRow(cmd.idempotencyKey);
    expect(failed?.state).toBe('STARTED');
    expect(failed?.processingOwner).toBeNull();
    expect(failed?.lastErrorCode).toBe('DEPENDENCY_UNAVAILABLE');
    expect(stub.find(cmd.idempotencyKey)).toBeNull();

    const result = await service().execute(cmd);
    expect(result.id).toBeDefined();
    expect(stub.find(cmd.idempotencyKey)?.status).toBe('ACTIVE');
    expect((await registrationRow(cmd.idempotencyKey))?.state).toBe('COMPLETED');
  });

  it('reconciles a User created before a timeout by retrying idempotently', async () => {
    const cmd = command();
    const createPath = '/internal/v1/registrations';
    stub.failNext({ methods: ['POST'], path: createPath, mode: 'after', status: 503 });
    stub.failNext({ methods: ['POST'], path: createPath, mode: 'after', status: 503 });

    await expect(service().execute(cmd)).rejects.toThrow(DependencyUnavailableError);

    expect(stub.find(cmd.idempotencyKey)?.status).toBe('PENDING');
    expect((await registrationRow(cmd.idempotencyKey))?.state).toBe('STARTED');

    await service().execute(cmd);

    expect(stub.find(cmd.idempotencyKey)?.status).toBe('ACTIVE');
    expect((await registrationRow(cmd.idempotencyKey))?.state).toBe('COMPLETED');
  });

  it('completes instead of cancelling when a User became ACTIVE before a timeout', async () => {
    const cmd = command();
    stub.failNext({ methods: ['POST'], pathEndsWith: '/activate', mode: 'after', status: 503 });
    stub.failNext({ methods: ['POST'], pathEndsWith: '/activate', mode: 'after', status: 503 });

    await expect(service().execute(cmd)).rejects.toThrow(DependencyUnavailableError);

    expect(stub.find(cmd.idempotencyKey)?.status).toBe('ACTIVE');
    expect((await registrationRow(cmd.idempotencyKey))?.state).toBe('CREDENTIAL_ACTIVE');

    await service().execute(cmd);

    expect(stub.find(cmd.idempotencyKey)?.status).toBe('ACTIVE');
    expect((await registrationRow(cmd.idempotencyKey))?.state).toBe('COMPLETED');
  });

  it('rejects the same idempotency key with a different fingerprint without touching Users', async () => {
    const cmd = command();
    await service().execute(cmd);
    const requestsAfterFirst = stub.requests.length;

    await expect(
      service().execute(
        command({
          idempotencyKey: cmd.idempotencyKey,
          input: {
            name: 'Other Person',
            email: 'other.person@example.test',
            password: 'Another-Password-42',
            role: 'OWNER',
          },
        }),
      ),
    ).rejects.toThrow(IdempotencyConflictError);

    expect(stub.requests.length).toBe(requestsAfterFirst);
    expect(await dependencies.prisma.registration.count()).toBe(1);
  });

  it('rejects a second key with an equivalent email as a conflict', async () => {
    await service().execute(
      command({
        input: {
          name: 'Jane Guest',
          email: 'dup@example.test',
          password: 'Correct-Horse-42',
          role: 'GUEST',
        },
      }),
    );

    await expect(
      service().execute(
        command({
          input: {
            name: 'Jane Guest',
            email: 'DUP@example.test',
            password: 'Correct-Horse-42',
            role: 'GUEST',
          },
        }),
      ),
    ).rejects.toThrow(RegistrationConflictError);
  });

  it('does not leave a partially authenticable identity', async () => {
    const cmd = command();
    await seed(cmd, 'CREDENTIAL_ACTIVE', 'ACTIVE', 'PENDING');

    expect(stub.find(cmd.idempotencyKey)?.status).toBe('PENDING');

    await service().execute(cmd);

    expect(stub.find(cmd.idempotencyKey)?.status).toBe('ACTIVE');
    const credential = await dependencies.prisma.credential.findFirst({
      where: { passwordHash: `hashed:${cmd.input.password}` },
    });
    expect(credential?.status).toBe('ACTIVE');
  });
});
