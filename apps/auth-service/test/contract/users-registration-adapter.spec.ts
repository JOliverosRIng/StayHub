import { randomUUID } from 'node:crypto';

import type { Clock } from '@auth/application/ports/clock.port';
import type { UuidGenerator } from '@auth/application/ports/random.port';
import type { PendingUserCommand } from '@auth/application/ports/users-service.port';
import {
  DependencyUnavailableError,
  RegistrationCancelledError,
  RegistrationConflictError,
} from '@auth/application/errors/auth-errors';
import { UsersRegistrationClient } from '@auth/infrastructure/http/users-registration.client';
import { UsersServiceClient } from '@auth/infrastructure/http/users-service.client';
import { UsersServiceTokenProvider } from '@auth/infrastructure/security/users-service-token.provider';
import { createAuthCryptoFixture, type AuthCryptoFixture } from '../helpers/crypto-fixture';
import { UsersStub, type UsersStubRole, type UsersStubStatus } from '../helpers/users-stub';

const clock: Clock = { now: (): Date => new Date() };
const uuids: UuidGenerator = { generate: randomUUID };

describe('UsersRegistrationClient (AUTH-041)', () => {
  let stub: UsersStub;
  let fixture: AuthCryptoFixture;
  let adapter: UsersRegistrationClient;

  beforeAll(async () => {
    stub = new UsersStub({
      requireServiceAuthorization: true,
      verifyServiceToken: (token: string): Promise<boolean> =>
        Promise.resolve(token.split('.').length === 3),
    });
    const baseUrl = await stub.start();
    fixture = createAuthCryptoFixture({
      usersServiceUrl: baseUrl,
      usersTimeoutMs: 2_000,
      usersCircuitFailureThreshold: 100,
    });
  });

  afterAll(async () => {
    await stub.stop();
  });

  beforeEach(() => {
    stub.reset();
    const provider = new UsersServiceTokenProvider(fixture.config, clock, uuids);
    const client = new UsersServiceClient(fixture.config, provider);
    adapter = new UsersRegistrationClient(client);
  });

  function command(overrides: Partial<PendingUserCommand> = {}): PendingUserCommand {
    return {
      registrationId: randomUUID(),
      userId: randomUUID(),
      name: 'Jane Guest',
      email: `person-${randomUUID()}@example.test`,
      role: 'GUEST',
      ...overrides,
    };
  }

  it('creates a pending user and propagates service token, key and traceId', async () => {
    const cmd = command();

    const identity = await adapter.createPendingUser(cmd, 'trace-adapter-1234');

    expect(identity).toEqual({
      userId: cmd.userId,
      name: cmd.name,
      email: cmd.email,
      role: 'GUEST',
      status: 'PENDING',
    });
    const request = stub.requests.at(-1);
    expect(request?.hasServiceAuthorization).toBe(true);
    expect(request?.idempotencyKey).toBe(cmd.registrationId);
    expect(request?.traceId).toBe('trace-adapter-1234');
    expect(request?.body).toEqual({
      registrationId: cmd.registrationId,
      userId: cmd.userId,
      name: cmd.name,
      email: cmd.email,
      role: 'GUEST',
    });
    expect(JSON.stringify(request?.body)).not.toContain('password');
  });

  it('returns the same identity on a repeated create', async () => {
    const cmd = command();

    const first = await adapter.createPendingUser(cmd, 'trace-first');
    const second = await adapter.createPendingUser(cmd, 'trace-second');

    expect(second).toEqual(first);
    expect(stub.requests.filter((request) => request.method === 'POST')).toHaveLength(2);
  });

  it('maps an email conflict to RegistrationConflictError', async () => {
    await adapter.createPendingUser(command({ email: 'taken@example.test' }), 'trace');

    await expect(
      adapter.createPendingUser(command({ email: 'TAKEN@example.test' }), 'trace'),
    ).rejects.toThrow(RegistrationConflictError);
  });

  it('maps Users unavailability to DependencyUnavailableError', async () => {
    stub.failNext({ methods: ['POST'], mode: 'before', status: 503 });
    stub.failNext({ methods: ['POST'], mode: 'before', status: 503 });

    await expect(adapter.createPendingUser(command(), 'trace')).rejects.toThrow(
      DependencyUnavailableError,
    );
  });

  it('rejects a create response that belongs to a different user', async () => {
    const registrationId = randomUUID();
    stub.seed({
      registrationId,
      userId: randomUUID(),
      name: 'Other Person',
      email: 'other.person@example.test',
      role: 'GUEST',
      status: 'PENDING',
    });

    await expect(
      adapter.createPendingUser(
        command({ registrationId, email: 'other.person@example.test' }),
        'trace',
      ),
    ).rejects.toThrow(DependencyUnavailableError);
  });

  it('gets a registration and returns null when absent', async () => {
    const cmd = command();
    await adapter.createPendingUser(cmd, 'trace');

    const found = await adapter.getRegistration(cmd.registrationId, 'trace');
    expect(found?.userId).toBe(cmd.userId);
    expect(await adapter.getRegistration(randomUUID(), 'trace')).toBeNull();
  });

  it('maps a server error on get to DependencyUnavailableError', async () => {
    stub.failNext({ methods: ['GET'], mode: 'before', status: 500 });
    stub.failNext({ methods: ['GET'], mode: 'before', status: 500 });

    await expect(adapter.getRegistration(randomUUID(), 'trace')).rejects.toThrow(
      DependencyUnavailableError,
    );
  });

  it('activates a registration', async () => {
    const cmd = command();
    await adapter.createPendingUser(cmd, 'trace');

    const active = await adapter.activateRegistration(cmd.registrationId, 'trace');

    expect(active).toMatchObject({ userId: cmd.userId, status: 'ACTIVE' });
  });

  it('maps activation of a cancelled registration to RegistrationCancelledError', async () => {
    const cmd = command();
    await adapter.createPendingUser(cmd, 'trace');
    await adapter.cancelRegistration(cmd.registrationId, 'trace');

    await expect(adapter.activateRegistration(cmd.registrationId, 'trace')).rejects.toThrow(
      RegistrationCancelledError,
    );
  });

  it('cancels a pending registration and maps cancellation of an active one to conflict', async () => {
    const pending = command();
    await adapter.createPendingUser(pending, 'trace');
    await expect(adapter.cancelRegistration(pending.registrationId, 'trace')).resolves.toBeUndefined();

    const active = command();
    await adapter.createPendingUser(active, 'trace');
    await adapter.activateRegistration(active.registrationId, 'trace');
    await expect(adapter.cancelRegistration(active.registrationId, 'trace')).rejects.toThrow(
      RegistrationConflictError,
    );
  });

  it('rejects malformed summaries with DependencyUnavailableError', async () => {
    const registrationId = randomUUID();
    stub.seed({
      registrationId,
      userId: randomUUID(),
      name: 'Jane Guest',
      email: 'jane.guest@example.test',
      role: 'BOGUS' as unknown as UsersStubRole,
      status: 'ACTIVE',
    });

    await expect(adapter.getRegistration(registrationId, 'trace')).rejects.toThrow(
      DependencyUnavailableError,
    );
  });

  it('rejects an unknown status with DependencyUnavailableError', async () => {
    const registrationId = randomUUID();
    stub.seed({
      registrationId,
      userId: randomUUID(),
      name: 'Jane Guest',
      email: 'jane.guest@example.test',
      role: 'GUEST',
      status: 'UNKNOWN' as unknown as UsersStubStatus,
    });

    await expect(adapter.getRegistration(registrationId, 'trace')).rejects.toThrow(
      DependencyUnavailableError,
    );
  });
});
