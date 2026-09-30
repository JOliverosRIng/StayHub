import {
  createServer,
  type IncomingHttpHeaders,
  type IncomingMessage,
  type Server,
  type ServerResponse,
} from 'node:http';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

import { HttpException } from '@nestjs/common';

import { GatewayDependencyError } from '@gateway/application/errors/gateway-errors';
import { AuthRegistrationClient } from '@gateway/infrastructure/http/auth-registration.client';
import { AuthSessionClient } from '@gateway/infrastructure/http/auth-session.client';
import type { GatewayConfig } from '@gateway/infrastructure/config/gateway-config';

import { createTestGatewayConfig } from '../support/gateway-config-fixture';

/**
 * GW-056 — Contrato consumer Gateway → Auth (RQ-02, FR-001–FR-013, constitución §VII).
 *
 * Ejerce los clientes REALES de GW-028 (registro) y GW-036 (login/refresh/introspección) contra un
 * stub local que hace de provider según el contrato interno acordado por el Grupo 3
 * (`contracts/openapi-auth-service.yaml`). Para cada interacción comprueba dos lados del contrato:
 *
 *  - Request: el Gateway envía service JWT (`Authorization: Bearer`), `x-trace-id`, `accept`, el
 *    `Content-Type` y el payload esperados; el registro añade `Idempotency-Key` (reintento seguro),
 *    mientras login/refresh/validate NO lo llevan (no son idempotentes).
 *  - Response: el cliente interpreta 200/201 (cuerpos felices) y traduce 400/401/409/429/503 a los
 *    estados correctos (GW-019), fallando cerrado en 503.
 *
 * Al final escribe el artefacto pact determinista para que G3 lo verifique como provider; la
 * verificación real contra el Auth desplegado es GW-058. No se duplica lógica de cliente ni de mapeo.
 */

const CONSUMER = 'stayhub-api-gateway';
const PROVIDER = 'stayhub-auth-service';
const SERVICE_TOKEN = 'service-jwt.consumer.contract';
const TRACE_ID = 'trace-consumer-0001';
const IDEMPOTENCY_KEY = 'idem-consumer-0001';

const ARTIFACT_DIR = resolve(__dirname, 'pacts');
const ARTIFACT_PATH = join(ARTIFACT_DIR, `${CONSUMER}-${PROVIDER}.json`);

type ClientKind = 'register' | 'login' | 'refresh' | 'validate';
type Expectation = 'ok' | 'throws' | 'failsClosed';

interface Interaction {
  readonly description: string;
  readonly client: ClientKind;
  readonly expect: Expectation;
  readonly request: {
    readonly method: 'POST';
    readonly path: string;
    readonly idempotency: boolean;
    readonly body: Record<string, unknown>;
  };
  readonly response: {
    readonly status: number;
    readonly contentType: string;
    readonly body: Record<string, unknown>;
  };
}

function problem(status: number, code: string): Record<string, unknown> {
  return {
    type: `https://contracts.stayhub.internal/errors/${code}`,
    title: code,
    status,
    detail: 'Documented failure of the internal Auth operation.',
    instance: '/internal/v1',
    code,
    traceId: TRACE_ID,
  };
}

const USER_SUMMARY = {
  id: '11111111-1111-4111-8111-111111111111',
  name: 'Ada Lovelace',
  email: 'ada@stayhub.test',
  role: 'GUEST',
};

const TOKEN_PAIR = {
  accessToken: 'access.jwt.placeholder',
  refreshToken: 'refresh.opaque.placeholder',
  expiresIn: 900,
  absoluteExpiresAt: '2026-01-01T00:15:00.000Z',
  principal: {
    userId: '11111111-1111-4111-8111-111111111111',
    sessionId: '22222222-2222-4222-8222-222222222222',
    role: 'GUEST',
  },
};

const REGISTER_BODY = {
  name: 'Ada Lovelace',
  email: 'ada@stayhub.test',
  password: 'S3cret-passphrase',
  role: 'GUEST' as const,
};
const LOGIN_BODY = { email: 'ada@stayhub.test', password: 'S3cret-passphrase' };
const REFRESH_BODY = { refreshToken: 'refresh.opaque.placeholder' };
const VALIDATE_BODY = {
  sessionId: '22222222-2222-4222-8222-222222222222',
  userId: '11111111-1111-4111-8111-111111111111',
};

const JSON_CT = 'application/json';
const PROBLEM_CT = 'application/problem+json';

const INTERACTIONS: readonly Interaction[] = [
  // POST /internal/v1/registrations (orchestrateRegistration) — 201/400/401/409/503
  {
    description: 'registration succeeds and returns the user summary (201)',
    client: 'register',
    expect: 'ok',
    request: { method: 'POST', path: '/internal/v1/registrations', idempotency: true, body: REGISTER_BODY },
    response: { status: 201, contentType: JSON_CT, body: USER_SUMMARY },
  },
  {
    description: 'registration is rejected as invalid (400)',
    client: 'register',
    expect: 'throws',
    request: { method: 'POST', path: '/internal/v1/registrations', idempotency: true, body: REGISTER_BODY },
    response: { status: 400, contentType: PROBLEM_CT, body: problem(400, 'VALIDATION_ERROR') },
  },
  {
    description: 'registration is rejected without a valid service token (401)',
    client: 'register',
    expect: 'throws',
    request: { method: 'POST', path: '/internal/v1/registrations', idempotency: true, body: REGISTER_BODY },
    response: { status: 401, contentType: PROBLEM_CT, body: problem(401, 'SERVICE_UNAUTHORIZED') },
  },
  {
    description: 'registration conflicts with an existing email (409)',
    client: 'register',
    expect: 'throws',
    request: { method: 'POST', path: '/internal/v1/registrations', idempotency: true, body: REGISTER_BODY },
    response: { status: 409, contentType: PROBLEM_CT, body: problem(409, 'EMAIL_ALREADY_REGISTERED') },
  },
  {
    description: 'registration fails closed when Auth is unavailable (503)',
    client: 'register',
    expect: 'failsClosed',
    request: { method: 'POST', path: '/internal/v1/registrations', idempotency: true, body: REGISTER_BODY },
    response: { status: 503, contentType: PROBLEM_CT, body: problem(503, 'DEPENDENCY_UNAVAILABLE') },
  },
  // POST /internal/v1/login (login) — 200/400/401/429/503
  {
    description: 'login succeeds and returns the token pair (200)',
    client: 'login',
    expect: 'ok',
    request: { method: 'POST', path: '/internal/v1/login', idempotency: false, body: LOGIN_BODY },
    response: { status: 200, contentType: JSON_CT, body: TOKEN_PAIR },
  },
  {
    description: 'login is rejected as invalid (400)',
    client: 'login',
    expect: 'throws',
    request: { method: 'POST', path: '/internal/v1/login', idempotency: false, body: LOGIN_BODY },
    response: { status: 400, contentType: PROBLEM_CT, body: problem(400, 'VALIDATION_ERROR') },
  },
  {
    description: 'login is rejected for bad credentials (401)',
    client: 'login',
    expect: 'throws',
    request: { method: 'POST', path: '/internal/v1/login', idempotency: false, body: LOGIN_BODY },
    response: { status: 401, contentType: PROBLEM_CT, body: problem(401, 'INVALID_CREDENTIALS') },
  },
  {
    description: 'login is throttled by Auth (429)',
    client: 'login',
    expect: 'throws',
    request: { method: 'POST', path: '/internal/v1/login', idempotency: false, body: LOGIN_BODY },
    response: { status: 429, contentType: PROBLEM_CT, body: problem(429, 'RATE_LIMITED') },
  },
  {
    description: 'login fails closed when Auth is unavailable (503)',
    client: 'login',
    expect: 'failsClosed',
    request: { method: 'POST', path: '/internal/v1/login', idempotency: false, body: LOGIN_BODY },
    response: { status: 503, contentType: PROBLEM_CT, body: problem(503, 'DEPENDENCY_UNAVAILABLE') },
  },
  // POST /internal/v1/sessions/refresh (rotateRefreshToken) — 200/401/503
  {
    description: 'refresh rotates the token pair (200)',
    client: 'refresh',
    expect: 'ok',
    request: { method: 'POST', path: '/internal/v1/sessions/refresh', idempotency: false, body: REFRESH_BODY },
    response: { status: 200, contentType: JSON_CT, body: TOKEN_PAIR },
  },
  {
    description: 'refresh is rejected when the token is reused or invalid (401)',
    client: 'refresh',
    expect: 'throws',
    request: { method: 'POST', path: '/internal/v1/sessions/refresh', idempotency: false, body: REFRESH_BODY },
    response: { status: 401, contentType: PROBLEM_CT, body: problem(401, 'REFRESH_REJECTED') },
  },
  {
    description: 'refresh fails closed when Auth is unavailable (503)',
    client: 'refresh',
    expect: 'failsClosed',
    request: { method: 'POST', path: '/internal/v1/sessions/refresh', idempotency: false, body: REFRESH_BODY },
    response: { status: 503, contentType: PROBLEM_CT, body: problem(503, 'DEPENDENCY_UNAVAILABLE') },
  },
  // POST /internal/v1/sessions/validate (validateSession) — 200/401/503
  {
    description: 'introspection returns the authoritative active session (200)',
    client: 'validate',
    expect: 'ok',
    request: { method: 'POST', path: '/internal/v1/sessions/validate', idempotency: false, body: VALIDATE_BODY },
    response: { status: 200, contentType: JSON_CT, body: { active: true, role: 'GUEST' } },
  },
  {
    description: 'introspection is rejected without a valid service token (401)',
    client: 'validate',
    expect: 'throws',
    request: { method: 'POST', path: '/internal/v1/sessions/validate', idempotency: false, body: VALIDATE_BODY },
    response: { status: 401, contentType: PROBLEM_CT, body: problem(401, 'SERVICE_UNAUTHORIZED') },
  },
  {
    description: 'introspection fails closed when Auth is unavailable (503)',
    client: 'validate',
    expect: 'failsClosed',
    request: { method: 'POST', path: '/internal/v1/sessions/validate', idempotency: false, body: VALIDATE_BODY },
    response: { status: 503, contentType: PROBLEM_CT, body: problem(503, 'DEPENDENCY_UNAVAILABLE') },
  },
];

interface RecordedRequest {
  readonly method: string;
  readonly path: string;
  readonly headers: IncomingHttpHeaders;
  readonly body: unknown;
}

interface Stub {
  readonly server: Server;
  listen(): Promise<void>;
  baseUrl(): string;
  reply(status: number, body: Record<string, unknown>, contentType: string): void;
  requests(): readonly RecordedRequest[];
  reset(): void;
}

function createStub(): Stub {
  const state = {
    requests: [] as RecordedRequest[],
    next: { status: 200, body: {} as Record<string, unknown>, contentType: JSON_CT },
  };
  const server = createServer((incoming: IncomingMessage, response: ServerResponse) => {
    const chunks: Buffer[] = [];
    incoming.on('data', (chunk: Buffer) => chunks.push(chunk));
    incoming.on('end', () => {
      const raw = Buffer.concat(chunks).toString();
      state.requests.push({
        method: incoming.method ?? '',
        path: incoming.url ?? '',
        headers: incoming.headers,
        body: raw.length > 0 ? JSON.parse(raw) : undefined,
      });
      response.writeHead(state.next.status, { 'content-type': state.next.contentType });
      response.end(JSON.stringify(state.next.body));
    });
  });
  return {
    server,
    listen: (): Promise<void> =>
      new Promise((resolve) => {
        server.listen(0, '127.0.0.1', () => resolve());
      }),
    baseUrl: (): string => {
      const address = server.address();
      if (address === null || typeof address === 'string') throw new Error('stub not listening');
      return `http://127.0.0.1:${address.port}`;
    },
    reply: (status, body, contentType): void => {
      state.next = { status, body, contentType };
    },
    requests: (): readonly RecordedRequest[] => state.requests,
    reset: (): void => {
      state.requests = [];
    },
  };
}

const stub = createStub();
const { config } = createTestGatewayConfig();
const instant = { sleep: (): Promise<void> => Promise.resolve() };

function authConfig(): GatewayConfig {
  return { ...config, authBaseUrl: stub.baseUrl() };
}

function serviceToken(): { issue: () => Promise<string> } {
  return { issue: (): Promise<string> => Promise.resolve(SERVICE_TOKEN) };
}

async function drive(interaction: Interaction): Promise<unknown> {
  const cfg = authConfig();
  switch (interaction.client) {
    case 'register':
      return new AuthRegistrationClient(cfg, serviceToken(), instant).register(
        REGISTER_BODY,
        { traceId: TRACE_ID, idempotencyKey: IDEMPOTENCY_KEY },
      );
    case 'login':
      return new AuthSessionClient(cfg, serviceToken(), instant).login(LOGIN_BODY, { traceId: TRACE_ID });
    case 'refresh':
      return new AuthSessionClient(cfg, serviceToken(), instant).refresh(
        REFRESH_BODY.refreshToken,
        { traceId: TRACE_ID },
      );
    case 'validate':
      return new AuthSessionClient(cfg, serviceToken(), instant).introspect(
        { userId: VALIDATE_BODY.userId, sessionId: VALIDATE_BODY.sessionId },
        { traceId: TRACE_ID },
      );
  }
}

async function statusOfRejection(run: () => Promise<unknown>): Promise<number> {
  try {
    await run();
  } catch (error) {
    if (error instanceof GatewayDependencyError) return 503;
    if (error instanceof HttpException) return error.getStatus();
    throw error;
  }
  throw new Error('expected the client to reject but it resolved');
}

describe('Contrato consumer Gateway → Auth (GW-056)', () => {
  beforeAll(async () => {
    await stub.listen();
  });

  afterAll(async () => {
    await new Promise<void>((resolve) => stub.server.close(() => resolve()));
  });

  beforeEach(() => stub.reset());

  describe.each(INTERACTIONS)('$description', (interaction) => {
    it('el Gateway envía el request acordado y trata la respuesta', async () => {
      stub.reply(interaction.response.status, interaction.response.body, interaction.response.contentType);

      if (interaction.expect === 'ok') {
        await expect(drive(interaction)).resolves.toEqual(interaction.response.body);
      } else {
        const status = await statusOfRejection(() => drive(interaction));
        const expected = interaction.expect === 'failsClosed' ? 503 : interaction.response.status;
        expect(status).toBe(expected);
      }

      const first = stub.requests()[0];
      expect(first).toBeDefined();
      expect(first?.method).toBe(interaction.request.method);
      expect(first?.path).toBe(interaction.request.path);
      expect(first?.headers['authorization']).toBe(`Bearer ${SERVICE_TOKEN}`);
      expect(first?.headers['x-trace-id']).toBe(TRACE_ID);
      expect(String(first?.headers['accept'])).toContain('application/json');
      expect(String(first?.headers['content-type'])).toContain('application/json');
      expect(first?.body).toEqual(interaction.request.body);

      if (interaction.request.idempotency) {
        expect(first?.headers['idempotency-key']).toBe(IDEMPOTENCY_KEY);
      } else {
        expect(first?.headers['idempotency-key']).toBeUndefined();
      }
    });
  });

  it('genera el artefacto pact determinista para la verificación del provider (G3, GW-058)', () => {
    const pact = {
      consumer: { name: CONSUMER },
      provider: { name: PROVIDER },
      metadata: {
        pactSpecification: { version: '3.0.0' },
        generatedBy: 'GW-056',
        alignedWith: 'specs/001-fundamentos-identidad/contracts/openapi-auth-service.yaml',
      },
      interactions: INTERACTIONS.map((interaction) => ({
        description: interaction.description,
        request: {
          method: interaction.request.method,
          path: interaction.request.path,
          headers: {
            authorization: `Bearer ${SERVICE_TOKEN}`,
            'x-trace-id': TRACE_ID,
            accept: 'application/json',
            'content-type': 'application/json',
            ...(interaction.request.idempotency ? { 'idempotency-key': IDEMPOTENCY_KEY } : {}),
          },
          body: interaction.request.body,
        },
        response: {
          status: interaction.response.status,
          headers: { 'content-type': interaction.response.contentType },
          body: interaction.response.body,
        },
      })),
    };

    mkdirSync(ARTIFACT_DIR, { recursive: true });
    writeFileSync(ARTIFACT_PATH, `${JSON.stringify(pact, null, 2)}\n`);

    const written = JSON.parse(readFileSync(ARTIFACT_PATH, 'utf8')) as typeof pact;
    expect(written.consumer.name).toBe(CONSUMER);
    expect(written.provider.name).toBe(PROVIDER);

    const paths = new Set(written.interactions.map((i) => i.request.path));
    expect(paths).toEqual(
      new Set([
        '/internal/v1/registrations',
        '/internal/v1/login',
        '/internal/v1/sessions/refresh',
        '/internal/v1/sessions/validate',
      ]),
    );

    const statuses = new Set(written.interactions.map((i) => i.response.status));
    expect(statuses).toEqual(new Set([200, 201, 400, 401, 409, 429, 503]));
  });
});
