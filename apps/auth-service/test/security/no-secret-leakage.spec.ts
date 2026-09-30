import { EventEmitter } from 'node:events';
import type { Server } from 'node:http';
import { randomUUID } from 'node:crypto';

import { trace } from '@opentelemetry/api';
import { logs } from '@opentelemetry/api-logs';
import {
  InMemoryLogRecordExporter,
  LoggerProvider,
  SimpleLogRecordProcessor,
} from '@opentelemetry/sdk-logs';
import {
  BasicTracerProvider,
  InMemorySpanExporter,
  SimpleSpanProcessor,
} from '@opentelemetry/sdk-trace-base';
import request from 'supertest';

import {
  DependencyUnavailableError,
  InvalidCredentialsError,
  LoginRateLimitError,
  RefreshTokenInvalidError,
} from '@auth/application/errors/auth-errors';
import {
  LOGIN_USE_CASE,
  REGISTER_ACCOUNT_USE_CASE,
  ROTATE_REFRESH_TOKEN_USE_CASE,
  VALIDATE_SESSION_USE_CASE,
  type IssuedTokenPair,
} from '@auth/application/ports/auth-use-cases.port';
import { CLOCK, type Clock } from '@auth/application/ports/clock.port';
import { AuthLogger } from '@auth/infrastructure/observability/auth-logger';
import { registerShutdownHooks } from '@auth/infrastructure/observability/shutdown';
import { startupFailureRecord } from '@auth/infrastructure/observability/startup';
import { ServiceJwtVerifier } from '@auth/infrastructure/security/service-jwt.verifier';
import { LoginController } from '@auth/interfaces/http/login.controller';
import { RegistrationController } from '@auth/interfaces/http/registration.controller';
import { SessionsController } from '@auth/interfaces/http/sessions.controller';
import { createAuthTestApp, type AuthTestApp } from '../helpers/auth-app';

jest.setTimeout(30_000);

const MARKERS = {
  password: 'pw-MARKER-7f3a@secret',
  hash: 'argon2id$v=19$m=65536,t=3,p=4$HASH-MARKER',
  serviceJwt: 'eyJhbGciOiJSUzI1NiJ9.JWT-MARKER.signature',
  access: 'access-MARKER-0123456789abcdefghijklmnopqrstuvwxyz',
  refresh: 'refresh-MARKER-0123456789abcdefghijklmnopqrstuvwxyz',
  email: 'leaky.person@marker.example.test',
};
const ALL_MARKERS = Object.values(MARKERS);
const EVIL_FIELD = `evil-field-${MARKERS.access}`;

const systemClock: Clock = { now: (): Date => new Date() };

const spanExporter = new InMemorySpanExporter();
const tracerProvider = new BasicTracerProvider();
tracerProvider.addSpanProcessor(new SimpleSpanProcessor(spanExporter));
const logExporter = new InMemoryLogRecordExporter();
const loggerProvider = new LoggerProvider();
loggerProvider.addLogRecordProcessor(new SimpleLogRecordProcessor(logExporter));

const registerAccount = { execute: jest.fn() };
const login = { execute: jest.fn() };
const rotate = { execute: jest.fn() };
const validate = { execute: jest.fn() };

interface WriteCall {
  readonly stream: 'stdout' | 'stderr';
  readonly chunk: string;
}

const writes: WriteCall[] = [];

function tokenPair(): IssuedTokenPair {
  return {
    accessToken: MARKERS.access,
    refreshToken: MARKERS.refresh,
    expiresIn: 3600,
    absoluteExpiresAt: new Date('2026-09-30T00:00:00.000Z'),
    principal: { userId: randomUUID(), sessionId: randomUUID(), role: 'GUEST' },
  };
}

function lines(stream: 'stdout' | 'stderr'): readonly string[] {
  return writes
    .filter((call) => call.stream === stream)
    .flatMap((call) => call.chunk.split('\n'))
    .filter((line) => line.trim() !== '');
}

function records(): readonly Record<string, unknown>[] {
  return [...lines('stdout'), ...lines('stderr')].map(
    (line) => JSON.parse(line) as Record<string, unknown>,
  );
}

function sinkOutput(): string {
  const spanText = spanExporter
    .getFinishedSpans()
    .map((span) => JSON.stringify({ name: span.name, attributes: span.attributes, events: span.events }))
    .join('\n');
  const logText = logExporter
    .getFinishedLogRecords()
    .map((record) => (typeof record.body === 'string' ? record.body : JSON.stringify(record.body)))
    .join('\n');
  return [...lines('stdout'), ...lines('stderr'), spanText, logText].join('\n');
}

function expectNoMarkers(): void {
  const output = sinkOutput();
  for (const marker of ALL_MARKERS) expect(output).not.toContain(marker);
}

describe('no secret leakage (AUTH-083)', () => {
  let opened: AuthTestApp | null = null;
  let stdoutSpy: jest.SpyInstance;
  let stderrSpy: jest.SpyInstance;

  beforeAll(async () => {
    trace.setGlobalTracerProvider(tracerProvider);
    logs.setGlobalLoggerProvider(loggerProvider);
    opened = await createAuthTestApp({
      providers: [
        ServiceJwtVerifier,
        { provide: CLOCK, useValue: systemClock },
        { provide: REGISTER_ACCOUNT_USE_CASE, useValue: registerAccount },
        { provide: LOGIN_USE_CASE, useValue: login },
        { provide: ROTATE_REFRESH_TOKEN_USE_CASE, useValue: rotate },
        { provide: VALIDATE_SESSION_USE_CASE, useValue: validate },
      ],
      controllers: [RegistrationController, LoginController, SessionsController],
    });
  });

  afterAll(async () => {
    if (opened !== null) await opened.close();
    await tracerProvider.shutdown();
    trace.disable();
    await loggerProvider.shutdown();
    logs.disable();
  });

  beforeEach(() => {
    writes.length = 0;
    spanExporter.reset();
    logExporter.reset();
    registerAccount.execute.mockReset();
    login.execute.mockReset();
    rotate.execute.mockReset();
    validate.execute.mockReset();
    registerAccount.execute.mockResolvedValue({
      id: randomUUID(),
      name: 'Ada Lovelace',
      email: MARKERS.email,
      role: 'GUEST',
    });
    login.execute.mockResolvedValue(tokenPair());
    rotate.execute.mockResolvedValue(tokenPair());
    validate.execute.mockResolvedValue({ active: true, role: 'GUEST' });
    stdoutSpy = jest
      .spyOn(process.stdout, 'write')
      .mockImplementation((chunk: unknown): boolean => {
        writes.push({ stream: 'stdout', chunk: String(chunk) });
        return true;
      });
    stderrSpy = jest
      .spyOn(process.stderr, 'write')
      .mockImplementation((chunk: unknown): boolean => {
        writes.push({ stream: 'stderr', chunk: String(chunk) });
        return true;
      });
  });

  afterEach(() => {
    stdoutSpy.mockRestore();
    stderrSpy.mockRestore();
  });

  function app(): AuthTestApp {
    if (opened === null) throw new Error('test app not initialised');
    return opened;
  }

  function server(): Server {
    return app().app.getHttpServer() as Server;
  }

  async function bearer(): Promise<string> {
    return `Bearer ${await app().fixture.issueInboundServiceToken()}`;
  }

  it('redacts markers across messages, nested context and reconciliation decisions', () => {
    const logger = new AuthLogger();

    logger.error(`snapshot failed ${MARKERS.serviceJwt}`, {
      code: 'DEPENDENCY_UNAVAILABLE',
      status: 503,
      traceId: 'trace-reconcile-1234',
      attempt: 3,
      password: MARKERS.password,
      accessToken: MARKERS.access,
      refreshToken: MARKERS.refresh,
      email: MARKERS.email,
      credential: { hash: MARKERS.hash },
      exception: new Error(`boom ${MARKERS.password} ${MARKERS.serviceJwt}`),
    });
    logger.log('registration_completed', { email: MARKERS.email });

    expectNoMarkers();
    expect(
      records().some(
        (record) =>
          (record.context as { code?: string } | undefined)?.code === 'DEPENDENCY_UNAVAILABLE' &&
          (record.context as { traceId?: string } | undefined)?.traceId === 'trace-reconcile-1234',
      ),
    ).toBe(true);
  });

  it('keeps the contractual registration summary while leaks stay out of every sink', async () => {
    const response = await request(server())
      .post('/internal/v1/registrations')
      .set('Authorization', await bearer())
      .set('Idempotency-Key', randomUUID())
      .send({ name: 'Ada Lovelace', email: MARKERS.email, password: MARKERS.password, role: 'GUEST' });

    expect(response.status).toBe(201);
    expect((response.body as { email?: string }).email).toBe(MARKERS.email);
    expectNoMarkers();
  });

  it('returns the token pair contractually without leaking it into logs or traces', async () => {
    const response = await request(server())
      .post('/internal/v1/login')
      .set('Authorization', await bearer())
      .set('x-trace-id', 'trace-login-success')
      .send({ email: MARKERS.email, password: MARKERS.password });

    expect(response.status).toBe(200);
    expect((response.body as { refreshToken?: string }).refreshToken).toBe(MARKERS.refresh);
    expect(response.headers['x-trace-id']).toBe('trace-login-success');

    const [span] = spanExporter.getFinishedSpans();
    expect(span?.name).toBe('POST /internal/v1/login');
    expect(span?.attributes).toMatchObject({
      'http.method': 'POST',
      'http.route': '/internal/v1/login',
      'http.status_code': 200,
      'trace.id': 'trace-login-success',
    });
    expect(Object.keys(span?.attributes ?? {}).sort()).toEqual([
      'http.method',
      'http.route',
      'http.status_code',
      'trace.id',
    ]);
    expectNoMarkers();
  });

  const FAILURES: ReadonlyArray<readonly [string, Error, number]> = [
    ['invalid credentials', new InvalidCredentialsError(), 401],
    ['rate limited login', new LoginRateLimitError(7), 429],
    ['unavailable dependency', new DependencyUnavailableError('users'), 503],
  ];

  it.each(FAILURES)(
    'correlates header, problem, log and span for %s without leaking',
    async (_name, error, status) => {
      login.execute.mockRejectedValue(error);
      const response = await request(server())
        .post('/internal/v1/login')
        .set('Authorization', await bearer())
        .set('x-trace-id', `trace-${status}-event`)
        .send({ email: MARKERS.email, password: MARKERS.password });

      expect(response.status).toBe(status);
      const traceId = response.headers['x-trace-id'];
      expect(traceId).toBe(`trace-${status}-event`);
      expect((response.body as { traceId?: string }).traceId).toBe(traceId);
      expect(records().some((record) => (record.context as { traceId?: string } | undefined)?.traceId === traceId)).toBe(true);
      const [span] = spanExporter.getFinishedSpans();
      expect(span?.attributes['trace.id']).toBe(traceId);
      if (error instanceof DependencyUnavailableError) {
        expect(span?.events.map((event) => event.name)).toContain('dependency_unavailable');
      }
      expectNoMarkers();
    },
  );

  it('rejects a replay without leaking the refresh token', async () => {
    rotate.execute.mockRejectedValue(new RefreshTokenInvalidError());
    const response = await request(server())
      .post('/internal/v1/sessions/refresh')
      .set('Authorization', await bearer())
      .send({ refreshToken: MARKERS.refresh });

    expect(response.status).toBe(401);
    expectNoMarkers();
  });

  it('strips query strings from the problem instance', async () => {
    const response = await request(server()).get(
      `/internal/v1/login?service_jwt=${MARKERS.serviceJwt}`,
    );

    expect(response.status).toBe(404);
    expect((response.body as { instance?: string }).instance).toBe('/internal/v1/login');
    expectNoMarkers();
  });

  it('does not echo unknown validation property names', async () => {
    const response = await request(server())
      .post('/internal/v1/login')
      .set('Authorization', await bearer())
      .send({ [EVIL_FIELD]: MARKERS.hash, email: 'not-an-email', password: MARKERS.password });

    expect(response.status).toBe(400);
    const errors = (response.body as { errors?: readonly string[] }).errors ?? [];
    expect(errors.join('\n')).not.toContain(MARKERS.access);
    expect(errors.join('\n')).not.toContain(MARKERS.hash);
    expectNoMarkers();
  });

  it('survives a malformed remote body without echoing it', async () => {
    const response = await request(server())
      .post('/internal/v1/login')
      .set('Authorization', await bearer())
      .set('Content-Type', 'application/json')
      .send(`{"email":"${MARKERS.email}","password":"${MARKERS.password}",`);

    expect(response.status).toBeGreaterThanOrEqual(400);
    expectNoMarkers();
  });

  it('preserves the traceId when the guard rejects the bearer', async () => {
    const response = await request(server())
      .post('/internal/v1/login')
      .set('Authorization', `Bearer ${MARKERS.serviceJwt}`)
      .set('x-trace-id', 'trace-guard-reject')
      .send({ email: MARKERS.email, password: MARKERS.password });

    expect(response.status).toBe(401);
    expect(response.headers['x-trace-id']).toBe('trace-guard-reject');
    expect((response.body as { traceId?: string }).traceId).toBe('trace-guard-reject');
    expect(spanExporter.getFinishedSpans()).toHaveLength(0);
    expectNoMarkers();
  });

  it('uses a safe startup failure record without the raw error', () => {
    const record = startupFailureRecord(
      new Error(`startup ${MARKERS.serviceJwt} ${MARKERS.password}`),
    );

    expect(record).toEqual({
      level: 'fatal',
      service: 'auth-service',
      code: 'STARTUP_FAILED',
      kind: 'error',
    });
    expect(JSON.stringify(record)).not.toContain(MARKERS.serviceJwt);
  });

  it('closes the application and stops telemetry once per signal', async () => {
    const source = new EventEmitter();
    const close = jest.fn((): Promise<void> => Promise.resolve());
    const stop = jest.fn((): Promise<void> => Promise.resolve());
    const registration = registerShutdownHooks({ close }, stop, source);

    source.emit('SIGTERM');
    source.emit('SIGINT');
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(close).toHaveBeenCalledTimes(1);
    expect(stop).toHaveBeenCalledTimes(1);
    registration.dispose();
  });
});
