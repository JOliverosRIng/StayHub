import { randomUUID } from 'node:crypto';
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import type { AddressInfo } from 'node:net';

import type { Clock } from '@auth/application/ports/clock.port';
import type { UuidGenerator } from '@auth/application/ports/random.port';
import { DependencyUnavailableError } from '@auth/application/errors/auth-errors';
import type { AuthConfig } from '@auth/infrastructure/config/auth-config';
import { UsersLoginIdentityClient } from '@auth/infrastructure/http/users-login-identity.client';
import { UsersServiceClient } from '@auth/infrastructure/http/users-service.client';
import { UsersServiceTokenProvider } from '@auth/infrastructure/security/users-service-token.provider';
import { createAuthCryptoFixture } from '../helpers/crypto-fixture';
import { UsersStub } from '../helpers/users-stub';

const clock: Clock = { now: (): Date => new Date() };
const uuids: UuidGenerator = { generate: randomUUID };
const RESOLVE_PATH = '/internal/v1/login-identities/resolve';

interface RawResponse {
  readonly status: number;
  readonly body: string;
  readonly contentType?: string;
  readonly delayMs?: number;
}

class RawUsersServer {
  private server: Server | null = null;
  private url = '';
  private readonly captured: string[] = [];
  public response: RawResponse = { status: 200, body: '{}', contentType: 'application/json' };

  public async start(): Promise<string> {
    const server = createServer((request, response) => {
      void this.handle(request, response);
    });
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    this.server = server;
    const address = server.address() as AddressInfo;
    this.url = `http://127.0.0.1:${address.port}`;
    return this.url;
  }

  public get baseUrl(): string {
    return this.url;
  }

  public get requests(): readonly string[] {
    return this.captured;
  }

  public reset(): void {
    this.captured.length = 0;
    this.response = { status: 200, body: '{}', contentType: 'application/json' };
  }

  public async stop(): Promise<void> {
    const server = this.server;
    this.server = null;
    this.url = '';
    if (server === null) return;
    await new Promise<void>((resolve, reject) => {
      server.close((error) => (error === undefined ? resolve() : reject(error)));
    });
  }

  private async handle(request: IncomingMessage, response: ServerResponse): Promise<void> {
    const chunks: Buffer[] = [];
    for await (const chunk of request) chunks.push(chunk as Buffer);
    this.captured.push(Buffer.concat(chunks).toString('utf8'));
    if (this.response.delayMs !== undefined) {
      await new Promise<void>((resolve) => setTimeout(resolve, this.response.delayMs));
    }
    response.writeHead(this.response.status, {
      'content-type': this.response.contentType ?? 'application/json',
    });
    response.end(this.response.body);
  }
}

function captureRejection(promise: Promise<unknown>): Promise<unknown> {
  return promise.then(
    () => null,
    (error: unknown) => error,
  );
}

describe('UsersLoginIdentityClient (AUTH-063)', () => {
  let stub: UsersStub;
  let raw: RawUsersServer;
  let stubConfig: AuthConfig;
  let rawConfig: AuthConfig;

  beforeAll(async () => {
    stub = new UsersStub({
      requireServiceAuthorization: true,
      verifyServiceToken: (token: string): Promise<boolean> =>
        Promise.resolve(token.split('.').length === 3),
    });
    raw = new RawUsersServer();
    const stubUrl = await stub.start();
    const rawUrl = await raw.start();
    stubConfig = createAuthCryptoFixture({
      usersServiceUrl: stubUrl,
      usersTimeoutMs: 2_000,
      usersCircuitFailureThreshold: 100,
    }).config;
    rawConfig = createAuthCryptoFixture({
      usersServiceUrl: rawUrl,
      usersTimeoutMs: 2_000,
      usersCircuitFailureThreshold: 100,
    }).config;
  });

  afterAll(async () => {
    await stub.stop();
    await raw.stop();
  });

  beforeEach(() => {
    stub.reset();
    raw.reset();
  });

  function build(config: AuthConfig): UsersLoginIdentityClient {
    const provider = new UsersServiceTokenProvider(config, clock, uuids);
    return new UsersLoginIdentityClient(new UsersServiceClient(config, provider));
  }

  function seedActive(email: string, role: 'GUEST' | 'OWNER' | 'ADMIN' = 'GUEST'): string {
    const userId = randomUUID();
    stub.seed({
      registrationId: randomUUID(),
      userId,
      name: 'Jane Guest',
      email,
      role,
      status: 'ACTIVE',
    });
    return userId;
  }

  it('resolves an ACTIVE identity sending the normalized email, service token and traceId', async (): Promise<void> => {
    const userId = seedActive('jane.doe@example.test', 'OWNER');
    const adapter = build(stubConfig);

    const identity = await adapter.resolveLoginIdentity('  Jane.Doe@Example.TEST  ', 'trace-login-1234');

    expect(identity).toEqual({ userId, role: 'OWNER', status: 'ACTIVE' });
    const request = stub.requests.at(-1);
    expect(request?.hasServiceAuthorization).toBe(true);
    expect(request?.traceId).toBe('trace-login-1234');
    expect(request?.body).toEqual({ email: 'jane.doe@example.test' });
  });

  it('returns null only when the provider reports 404', async (): Promise<void> => {
    const adapter = build(stubConfig);

    await expect(adapter.resolveLoginIdentity('nobody@example.test', 'trace')).resolves.toBeNull();
  });

  const providerFailures: ReadonlyArray<[string, RawResponse]> = [
    ['a 401', { status: 401, body: '{}' }],
    ['a 403', { status: 403, body: '{}' }],
    ['a 500', { status: 500, body: '{}' }],
    ['a 503', { status: 503, body: '{}' }],
  ];

  it.each(providerFailures)('maps %s to DependencyUnavailableError', async (_label, response): Promise<void> => {
    raw.response = response;
    const adapter = build(rawConfig);

    await expect(adapter.resolveLoginIdentity('jane@example.test', 'trace')).rejects.toThrow(
      DependencyUnavailableError,
    );
  });

  it('maps invalid JSON to DependencyUnavailableError', async (): Promise<void> => {
    raw.response = { status: 200, body: 'not-json{', contentType: 'application/json' };
    const adapter = build(rawConfig);

    await expect(adapter.resolveLoginIdentity('jane@example.test', 'trace')).rejects.toThrow(
      DependencyUnavailableError,
    );
  });

  it('maps a timeout to DependencyUnavailableError', async (): Promise<void> => {
    const timeoutConfig = createAuthCryptoFixture({
      usersServiceUrl: raw.baseUrl,
      usersTimeoutMs: 100,
      usersCircuitFailureThreshold: 100,
    }).config;
    raw.response = { status: 200, body: '{}', delayMs: 500 };
    const adapter = build(timeoutConfig);

    await expect(adapter.resolveLoginIdentity('jane@example.test', 'trace')).rejects.toThrow(
      DependencyUnavailableError,
    );
  });

  it('retries an idempotent query on a server error', async (): Promise<void> => {
    raw.response = { status: 500, body: '{}' };
    const adapter = build(rawConfig);

    await expect(adapter.resolveLoginIdentity('jane@example.test', 'trace')).rejects.toThrow(
      DependencyUnavailableError,
    );
    expect(raw.requests).toHaveLength(2);
  });

  it('opens the circuit after repeated failures and fails closed', async (): Promise<void> => {
    const circuitConfig = createAuthCryptoFixture({
      usersServiceUrl: raw.baseUrl,
      usersTimeoutMs: 2_000,
      usersCircuitFailureThreshold: 1,
    }).config;
    raw.response = { status: 500, body: '{}' };
    const adapter = build(circuitConfig);

    await expect(adapter.resolveLoginIdentity('jane@example.test', 'trace')).rejects.toThrow(
      DependencyUnavailableError,
    );
    const requestsAfterFirst = raw.requests.length;
    await expect(adapter.resolveLoginIdentity('jane@example.test', 'trace')).rejects.toThrow(
      DependencyUnavailableError,
    );
    expect(raw.requests).toHaveLength(requestsAfterFirst);
  });

  const contractViolations = [
    'PENDING',
    'CANCELLED',
  ].map((status) => ({
    label: status,
    body: JSON.stringify({ userId: randomUUID(), role: 'GUEST', status }),
  }));

  it.each(contractViolations)(
    'rejects a 200 with status $label as a contract violation',
    async ({ body }): Promise<void> => {
      raw.response = { status: 200, body, contentType: 'application/json' };
      const adapter = build(rawConfig);

      await expect(adapter.resolveLoginIdentity('jane@example.test', 'trace')).rejects.toThrow(
        DependencyUnavailableError,
      );
    },
  );

  const malformedBodies = [
    { label: 'an empty userId', body: JSON.stringify({ userId: '', role: 'GUEST', status: 'ACTIVE' }) },
    { label: 'a non UUID userId', body: JSON.stringify({ userId: '12345', role: 'GUEST', status: 'ACTIVE' }) },
    { label: 'an unknown role', body: JSON.stringify({ userId: randomUUID(), role: 'ROOT', status: 'ACTIVE' }) },
    { label: 'missing fields', body: JSON.stringify({}) },
    { label: 'an array', body: JSON.stringify([]) },
  ];

  it.each(malformedBodies)('rejects a 200 with $label', async ({ body }): Promise<void> => {
    raw.response = { status: 200, body, contentType: 'application/json' };
    const adapter = build(rawConfig);

    await expect(adapter.resolveLoginIdentity('jane@example.test', 'trace')).rejects.toThrow(
      DependencyUnavailableError,
    );
  });

  it('drops any extra profile fields from the provider response', async (): Promise<void> => {
    const userId = randomUUID();
    raw.response = {
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        userId,
        role: 'OWNER',
        status: 'ACTIVE',
        name: 'Jane Guest',
        email: 'jane.doe@example.test',
        profile: { plan: 'gold' },
      }),
    };
    const adapter = build(rawConfig);

    const identity = await adapter.resolveLoginIdentity('jane.doe@example.test', 'trace');

    expect(identity).toEqual({ userId, role: 'OWNER', status: 'ACTIVE' });
    expect(Object.keys(identity ?? {}).sort()).toEqual(['role', 'status', 'userId']);
  });

  it('resolves the identity from the provider on every call without caching', async (): Promise<void> => {
    const firstUserId = seedActive('first@example.test', 'GUEST');
    const secondUserId = seedActive('second@example.test', 'ADMIN');
    const adapter = build(stubConfig);

    const first = await adapter.resolveLoginIdentity('first@example.test', 'trace-1');
    const second = await adapter.resolveLoginIdentity('second@example.test', 'trace-2');

    expect(first?.userId).toBe(firstUserId);
    expect(second?.userId).toBe(secondUserId);
    const resolveRequests = stub.requests.filter((entry) => entry.path === RESOLVE_PATH);
    expect(resolveRequests).toHaveLength(2);
    expect(resolveRequests[0]?.body).toEqual({ email: 'first@example.test' });
    expect(resolveRequests[1]?.body).toEqual({ email: 'second@example.test' });
  });

  it('does not leak the raw email in the dependency error', async (): Promise<void> => {
    raw.response = { status: 500, body: '{}' };
    const adapter = build(rawConfig);

    const error = await captureRejection(
      adapter.resolveLoginIdentity('secret.person@example.test', 'trace'),
    );

    expect(error).toBeInstanceOf(DependencyUnavailableError);
    expect((error as Error).message).not.toContain('secret.person');
    expect((error as Error).message).not.toContain('@');
  });
});
