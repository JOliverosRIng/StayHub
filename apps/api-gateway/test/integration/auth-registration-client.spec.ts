import { HttpException } from '@nestjs/common';

import { GatewayDependencyError } from '@gateway/application/errors/gateway-errors';
import type { CircuitPolicy, GatewayConfig } from '@gateway/infrastructure/config/gateway-config';
import type { HttpFetch, ServiceTokenIssuer } from '@gateway/infrastructure/http/service-client.base';

import { createTestGatewayConfig } from '../support/gateway-config-fixture';

/**
 * GW-025 — Integración del cliente de registro del Gateway hacia Auth.
 *
 * Test-first: el cliente `AuthRegistrationClient` se implementa en GW-028, por lo que este spec
 * DEBE quedar en rojo. El cliente se carga por import dinámico con especificador variable, de
 * modo que TypeScript/ESLint permanecen verdes y el fallo ocurre en tiempo de ejecución con
 * "Cannot find module …/auth-registration.client" — es decir, por cliente ausente, no por
 * configuración del harness. Cuando GW-028 exista, estas pruebas lo ejercitarán.
 *
 * Reutiliza GW-018 (`ServiceClientBase`: service JWT, timeout, circuit breaker, reintentos solo
 * idempotentes) y GW-019 (`remote-problem.mapper`: mapeo de errores remotos a Problem Details).
 * Auth se sustituye por un `fetch` falso (no se depende del servicio Auth real).
 */

const CLIENT_MODULE = '../../src/infrastructure/http/auth-registration.client';

interface RegisterInput {
  readonly name: string;
  readonly email: string;
  readonly password: string;
  readonly role: 'GUEST' | 'OWNER';
}

interface RegisterContext {
  readonly traceId: string;
  readonly idempotencyKey: string;
}

interface UserSummary {
  readonly id: string;
  readonly name: string;
  readonly email: string;
  readonly role: string;
}

interface AuthRegistrationClient {
  register(input: RegisterInput, context: RegisterContext): Promise<UserSummary>;
}

interface AuthRegistrationClientDeps {
  readonly fetch?: HttpFetch;
  readonly now?: () => number;
  readonly sleep?: (ms: number) => Promise<void>;
}

type AuthRegistrationClientCtor = new (
  config: GatewayConfig,
  serviceToken: ServiceTokenIssuer,
  deps?: AuthRegistrationClientDeps,
) => AuthRegistrationClient;

async function loadAuthRegistrationClient(): Promise<AuthRegistrationClientCtor> {
  const specifier: string = CLIENT_MODULE;
  const module = (await import(specifier)) as {
    AuthRegistrationClient?: AuthRegistrationClientCtor;
  };
  if (module.AuthRegistrationClient === undefined) {
    throw new Error('GW-028 pendiente: AuthRegistrationClient no exporta la clase esperada');
  }
  return module.AuthRegistrationClient;
}

interface Behavior {
  readonly status?: number;
  readonly body?: string;
  readonly contentType?: string;
  readonly hang?: boolean;
}

interface CapturedCall {
  readonly headers: Headers;
  readonly method: string;
  readonly body: string;
}

interface FetchStub {
  readonly fetch: HttpFetch;
  readonly calls: CapturedCall[];
}

function createFetchStub(behaviors: Behavior[]): FetchStub {
  const calls: CapturedCall[] = [];
  let index = 0;

  const fetch: HttpFetch = async (_input, init): Promise<Response> => {
    const headers = new Headers(init?.headers);
    const body = typeof init?.body === 'string' ? init.body : decodeBody(init?.body);
    calls.push({ headers, method: init?.method ?? 'GET', body });

    const behavior = behaviors[Math.min(index, behaviors.length - 1)] ?? { status: 200 };
    index += 1;

    if (behavior.hang === true) {
      return new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener('abort', () => reject(new Error('aborted')));
      });
    }
    const responseInit: ResponseInit = {
      status: behavior.status ?? 200,
      headers: { 'content-type': behavior.contentType ?? 'application/json' },
    };
    return Promise.resolve(new Response(behavior.body ?? '', responseInit));
  };

  return { fetch, calls };
}

function decodeBody(body: BodyInit | null | undefined): string {
  return body instanceof Uint8Array ? new TextDecoder().decode(body) : '';
}

function summaryBody(email: string): string {
  return JSON.stringify({
    id: '11111111-1111-4111-8111-111111111111',
    name: 'Ada Lovelace',
    email,
    role: 'GUEST',
  });
}

function createIssuer(): { issuer: ServiceTokenIssuer; issued: () => number } {
  let count = 0;
  return {
    issuer: {
      issue: (): Promise<string> => {
        count += 1;
        return Promise.resolve(`service-jwt-${count}`);
      },
    },
    issued: (): number => count,
  };
}

const INPUT: RegisterInput = {
  name: 'Ada Lovelace',
  email: 'ada@stayhub.test',
  password: 'correct horse',
  role: 'GUEST',
};

const CONTEXT: RegisterContext = {
  traceId: 'trace-register-001',
  idempotencyKey: '9f1b1d2e-0000-4000-8000-000000000000',
};

interface Harness {
  readonly client: AuthRegistrationClient;
  readonly stub: FetchStub;
  readonly issued: () => number;
}

async function build(
  behaviors: Behavior[],
  options: { now?: () => number; circuit?: CircuitPolicy } = {},
): Promise<Harness> {
  const base = createTestGatewayConfig().config;
  const config: GatewayConfig =
    options.circuit === undefined ? base : { ...base, auth: options.circuit };
  const stub = createFetchStub(behaviors);
  const { issuer, issued } = createIssuer();
  const Client = await loadAuthRegistrationClient();
  const client = new Client(config, issuer, {
    fetch: stub.fetch,
    now: options.now ?? ((): number => 0),
    sleep: (): Promise<void> => Promise.resolve(),
  });
  return { client, stub, issued };
}

async function rejection(promise: Promise<unknown>): Promise<unknown> {
  return promise.then(
    () => {
      throw new Error('se esperaba un rechazo, pero la promesa resolvió');
    },
    (error: unknown) => error,
  );
}

describe('Cliente de registro Gateway→Auth (GW-025)', () => {
  describe('Autenticación de servicio', () => {
    it('llama a Auth con un service JWT breve y no con el bearer del usuario', async () => {
      const { client, stub, issued } = await build([{ status: 201, body: summaryBody(INPUT.email) }]);

      await client.register(INPUT, CONTEXT);

      expect(issued()).toBeGreaterThanOrEqual(1);
      const sent = stub.calls[0];
      expect(sent?.method).toBe('POST');
      expect(sent?.headers.get('authorization')).toBe('Bearer service-jwt-1');
      expect(sent?.headers.get('x-trace-id')).toBe(CONTEXT.traceId);
    });

    it('propaga la Idempotency-Key indicada hacia Auth', async () => {
      const { client, stub } = await build([{ status: 201, body: summaryBody(INPUT.email) }]);

      await client.register(INPUT, CONTEXT);

      expect(stub.calls[0]?.headers.get('idempotency-key')).toBe(CONTEXT.idempotencyKey);
    });
  });

  describe('Timeout y circuit breaker', () => {
    it('convierte un timeout en GatewayDependencyError', async () => {
      const { client } = await build([{ hang: true }], {
        circuit: { timeoutMs: 30, failureThreshold: 5, resetMs: 1000 },
      });

      const error = await rejection(client.register(INPUT, CONTEXT));
      expect(error).toBeInstanceOf(GatewayDependencyError);
    });

    it('abre el circuito tras fallos repetidos y deja de llamar a Auth', async () => {
      let now = 0;
      const { client, stub } = await build([{ hang: true }], {
        now: (): number => now,
        circuit: { timeoutMs: 30, failureThreshold: 1, resetMs: 1000 },
      });

      await rejection(client.register(INPUT, CONTEXT));
      const callsAfterFirst = stub.calls.length;

      // Circuito abierto: la segunda llamada falla rápido sin tocar Auth.
      const error = await rejection(client.register(INPUT, CONTEXT));
      expect(error).toBeInstanceOf(GatewayDependencyError);
      expect(stub.calls.length).toBe(callsAfterFirst);

      // Tras el resetMs pasa a half-open y vuelve a intentar.
      now = 2000;
      await rejection(client.register(INPUT, CONTEXT));
      expect(stub.calls.length).toBeGreaterThan(callsAfterFirst);
    });
  });

  describe('Reintentos solo idempotentes', () => {
    it('reintenta el registro idempotente ante 503 y resuelve el éxito posterior', async () => {
      const { client, stub } = await build([
        { status: 503, contentType: 'application/problem+json' },
        { status: 201, body: summaryBody(INPUT.email) },
      ]);

      const summary = await client.register(INPUT, CONTEXT);

      expect(stub.calls.length).toBe(2);
      expect(summary.email).toBe(INPUT.email);
      // Todos los intentos conservan la misma Idempotency-Key.
      expect(stub.calls.every((call) => call.headers.get('idempotency-key') === CONTEXT.idempotencyKey)).toBe(
        true,
      );
    });
  });

  describe('Mapeo de errores de Auth a Problem Details (GW-019)', () => {
    it('devuelve el UserSummary en un 201', async () => {
      const { client } = await build([{ status: 201, body: summaryBody('owner@stayhub.test') }]);

      const summary = await client.register({ ...INPUT, role: 'OWNER' }, CONTEXT);

      expect(typeof summary.id).toBe('string');
      expect(summary.email).toBe('owner@stayhub.test');
      expect(typeof summary.role).toBe('string');
    });

    it('preserva un 400 de Auth', async () => {
      const { client } = await build([
        { status: 400, contentType: 'application/problem+json', body: JSON.stringify({ code: 'INVALID' }) },
      ]);

      const error = (await rejection(client.register(INPUT, CONTEXT))) as HttpException;
      expect(error).toBeInstanceOf(HttpException);
      expect(error.getStatus()).toBe(400);
    });

    it('preserva un 409 de Auth conservando su código', async () => {
      const { client } = await build([
        {
          status: 409,
          contentType: 'application/problem+json',
          body: JSON.stringify({ code: 'EMAIL_ALREADY_REGISTERED' }),
        },
      ]);

      const error = (await rejection(client.register(INPUT, CONTEXT))) as HttpException;
      expect(error.getStatus()).toBe(409);
      expect((error.getResponse() as { code?: string }).code).toBe('EMAIL_ALREADY_REGISTERED');
    });

    it('preserva un 429 de Auth', async () => {
      const { client } = await build([
        { status: 429, contentType: 'application/problem+json', body: JSON.stringify({ code: 'RATE' }) },
      ]);

      const error = (await rejection(client.register(INPUT, CONTEXT))) as HttpException;
      expect(error.getStatus()).toBe(429);
    });

    it('normaliza la indisponibilidad de Auth a 503', async () => {
      const { client } = await build([{ status: 503, contentType: 'application/problem+json' }]);

      const error = (await rejection(client.register(INPUT, CONTEXT))) as HttpException;
      expect(error.getStatus()).toBe(503);
      expect((error.getResponse() as { code?: string }).code).toBe('DEPENDENCY_UNAVAILABLE');
    });
  });
});
