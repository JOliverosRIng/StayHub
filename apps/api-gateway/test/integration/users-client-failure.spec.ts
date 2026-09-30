import { HttpException } from '@nestjs/common';

import { GatewayDependencyError } from '@gateway/application/errors/gateway-errors';
import type { CircuitPolicy, GatewayConfig } from '@gateway/infrastructure/config/gateway-config';
import type { HttpFetch, ServiceTokenIssuer } from '@gateway/infrastructure/http/service-client.base';

import { createTestGatewayConfig } from '../support/gateway-config-fixture';

/**
 * GW-045 — Fallos del cliente Users del Gateway (FR-018–FR-019, FR-023).
 *
 * Test-first: el cliente `UsersProfileClient` se implementa en GW-046, por lo que este spec DEBE
 * quedar en rojo. Se carga por import dinámico con especificador variable, de modo que
 * TypeScript/ESLint permanecen verdes y el fallo ocurre en tiempo de ejecución con "Cannot find
 * module …/users-profile.client" — es decir, por cliente ausente, no por harness.
 *
 * Reutiliza GW-018 (`ServiceClientBase`: timeout, circuit breaker) y GW-019 (`remote-problem.mapper`:
 * mapeo a Problem Details). Users se sustituye por un `fetch` falso (no se depende del servicio real).
 */

const USERS_CLIENT_MODULE = '../../src/infrastructure/http/users-profile.client';
const OWNER_ID = '11111111-1111-4111-8111-111111111111';

interface UsersProfile {
  readonly id: string;
  readonly name: string;
  readonly email: string;
  readonly role: string;
  readonly version: number;
}

interface ProfileContext {
  readonly traceId: string;
  readonly bearer: string;
}

interface UsersProfileClient {
  getProfile(userId: string, context: ProfileContext): Promise<UsersProfile>;
}

interface UsersProfileClientDeps {
  readonly fetch?: HttpFetch;
  readonly now?: () => number;
  readonly sleep?: (ms: number) => Promise<void>;
}

type UsersProfileClientCtor = new (
  config: GatewayConfig,
  serviceToken: ServiceTokenIssuer,
  deps?: UsersProfileClientDeps,
) => UsersProfileClient;

async function loadUsersProfileClient(): Promise<UsersProfileClientCtor> {
  const specifier: string = USERS_CLIENT_MODULE;
  const module = (await import(specifier)) as { UsersProfileClient?: UsersProfileClientCtor };
  if (module.UsersProfileClient === undefined) {
    throw new Error('GW-046 pendiente: UsersProfileClient no exporta la clase esperada');
  }
  return module.UsersProfileClient;
}

interface Behavior {
  readonly status?: number;
  readonly body?: string;
  readonly contentType?: string;
  readonly hang?: boolean;
  readonly midStream?: boolean;
}

interface FetchStub {
  readonly fetch: HttpFetch;
  readonly calls: number;
}

function createFetchStub(behaviors: Behavior[]): FetchStub {
  const stub = { calls: 0 } as { calls: number; fetch: HttpFetch };
  let index = 0;

  stub.fetch = (_input, init): Promise<Response> => {
    stub.calls += 1;
    const behavior = behaviors[Math.min(index, behaviors.length - 1)] ?? { status: 200 };
    index += 1;

    if (behavior.hang === true) {
      return new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener('abort', () => reject(new Error('aborted')));
      });
    }
    if (behavior.midStream === true) {
      const stream = new ReadableStream<Uint8Array>({
        start(controller): void {
          controller.enqueue(new TextEncoder().encode('{"id":"partial"'));
          controller.error(new Error('connection reset mid-stream'));
        },
      });
      return Promise.resolve(
        new Response(stream, { status: 200, headers: { 'content-type': 'application/json' } }),
      );
    }
    return Promise.resolve(
      new Response(behavior.body ?? '', {
        status: behavior.status ?? 200,
        headers: { 'content-type': behavior.contentType ?? 'application/json' },
      }),
    );
  };

  return stub;
}

function profileBody(): string {
  return JSON.stringify({
    id: OWNER_ID,
    name: 'Ada Lovelace',
    email: 'ada@stayhub.test',
    role: 'GUEST',
    version: 1,
  });
}

function createIssuer(): ServiceTokenIssuer {
  return { issue: (): Promise<string> => Promise.resolve('service-jwt') };
}

const CONTEXT: ProfileContext = { traceId: 'trace-users-001', bearer: 'user.bearer.jwt' };

interface Harness {
  readonly client: UsersProfileClient;
  readonly stub: FetchStub;
}

async function build(
  behaviors: Behavior[],
  options: { now?: () => number; circuit?: CircuitPolicy } = {},
): Promise<Harness> {
  const base = createTestGatewayConfig().config;
  const config: GatewayConfig =
    options.circuit === undefined ? base : { ...base, users: options.circuit };
  const stub = createFetchStub(behaviors);
  const Client = await loadUsersProfileClient();
  const client = new Client(config, createIssuer(), {
    fetch: stub.fetch,
    now: options.now ?? ((): number => 0),
    sleep: (): Promise<void> => Promise.resolve(),
  });
  return { client, stub };
}

async function rejection(promise: Promise<unknown>): Promise<unknown> {
  return promise.then(
    () => {
      throw new Error('se esperaba un rechazo, pero la promesa resolvió');
    },
    (error: unknown) => error,
  );
}

describe('Fallos del cliente Users (GW-045)', () => {
  it('devuelve el perfil parseado ante un 200', async () => {
    const { client } = await build([{ status: 200, body: profileBody() }]);

    const profile = await client.getProfile(OWNER_ID, CONTEXT);

    expect(profile.id).toBe(OWNER_ID);
    expect(typeof profile.version).toBe('number');
  });

  it('convierte un timeout hacia Users en 503 (GatewayDependencyError) sin colgar', async () => {
    const { client } = await build([{ hang: true }], {
      circuit: { timeoutMs: 30, failureThreshold: 5, resetMs: 1000 },
    });

    const error = await rejection(client.getProfile(OWNER_ID, CONTEXT));
    expect(error).toBeInstanceOf(GatewayDependencyError);
  });

  it('abre el circuito tras fallos repetidos y responde 503 rápido sin tocar Users', async () => {
    let now = 0;
    const { client, stub } = await build([{ hang: true }], {
      now: (): number => now,
      circuit: { timeoutMs: 30, failureThreshold: 1, resetMs: 1000 },
    });

    await rejection(client.getProfile(OWNER_ID, CONTEXT));
    const callsAfterFirst = stub.calls;

    const error = await rejection(client.getProfile(OWNER_ID, CONTEXT));
    expect(error).toBeInstanceOf(GatewayDependencyError);
    expect(stub.calls).toBe(callsAfterFirst);

    now = 2000;
    await rejection(client.getProfile(OWNER_ID, CONTEXT));
    expect(stub.calls).toBeGreaterThan(callsAfterFirst);
  });

  it('si Users falla a mitad de la respuesta, devuelve 503 y NINGÚN cuerpo parcial', async () => {
    const { client } = await build([{ midStream: true }]);

    const error = await rejection(client.getProfile(OWNER_ID, CONTEXT));
    // No se entrega un perfil parcial/corrupto: la petición se resuelve como dependencia caída.
    expect(error).toBeInstanceOf(GatewayDependencyError);
  });

  it('mapea un 404 de Users conservando el estado (GW-019)', async () => {
    const { client } = await build([
      { status: 404, contentType: 'application/problem+json', body: JSON.stringify({ code: 'PROFILE_NOT_FOUND' }) },
    ]);

    const error = (await rejection(client.getProfile(OWNER_ID, CONTEXT))) as HttpException;
    expect(error).toBeInstanceOf(HttpException);
    expect(error.getStatus()).toBe(404);
    expect((error.getResponse() as { code?: string }).code).toBe('PROFILE_NOT_FOUND');
  });

  it('mapea un 403 de Users conservando el estado', async () => {
    const { client } = await build([
      { status: 403, contentType: 'application/problem+json', body: JSON.stringify({ code: 'FORBIDDEN' }) },
    ]);

    const error = (await rejection(client.getProfile(OWNER_ID, CONTEXT))) as HttpException;
    expect(error.getStatus()).toBe(403);
  });

  it('mapea un 409 de Users conservando el estado', async () => {
    const { client } = await build([
      { status: 409, contentType: 'application/problem+json', body: JSON.stringify({ code: 'PROFILE_VERSION_CONFLICT' }) },
    ]);

    const error = (await rejection(client.getProfile(OWNER_ID, CONTEXT))) as HttpException;
    expect(error.getStatus()).toBe(409);
  });

  it('normaliza un 503 de Users a DEPENDENCY_UNAVAILABLE', async () => {
    const { client } = await build([{ status: 503, contentType: 'application/problem+json' }]);

    const error = (await rejection(client.getProfile(OWNER_ID, CONTEXT))) as HttpException;
    expect(error.getStatus()).toBe(503);
    expect((error.getResponse() as { code?: string }).code).toBe('DEPENDENCY_UNAVAILABLE');
  });
});
