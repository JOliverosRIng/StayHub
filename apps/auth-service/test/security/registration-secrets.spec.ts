import type { Server } from 'node:http';
import { Controller, Get, UseGuards, type Type } from '@nestjs/common';
import request from 'supertest';

import { CLOCK, type Clock } from '@auth/application/ports/clock.port';
import { DependencyUnavailableError, RegistrationConflictError } from '@auth/application/errors/auth-errors';
import { AuthLogger } from '@auth/infrastructure/observability/auth-logger';
import { emitTelemetryLog } from '@auth/infrastructure/observability/otel';
import { ServiceJwtVerifier } from '@auth/infrastructure/security/service-jwt.verifier';
import { ServiceAuthGuard } from '@auth/interfaces/http/guards/service-auth.guard';
import { createAuthTestApp, type AuthTestApp } from '../helpers/auth-app';

jest.mock('@auth/infrastructure/observability/otel', () => ({
  emitTelemetryLog: jest.fn(),
}));

const emitMock = emitTelemetryLog as jest.MockedFunction<typeof emitTelemetryLog>;

const MARKERS = {
  password: 'pw-MARKER-7f3a@secret',
  hash: 'argon2id$v=19$m=65536,t=3,p=4$HASH-MARKER',
  serviceJwt: 'eyJhbGciOiJSUzI1NiJ9.JWT-MARKER.signature',
  email: 'leaky.person@marker.example.test',
};
const ALL_MARKERS = Object.values(MARKERS);

const systemClock: Clock = { now: (): Date => new Date() };

@Controller('boom')
class BoomController {
  @Get('unknown')
  public unknown(): never {
    throw new Error(`boom ${MARKERS.serviceJwt} ${MARKERS.password}`);
  }

  @Get('dependency')
  public dependency(): never {
    throw new DependencyUnavailableError('users');
  }

  @Get('conflict')
  public conflict(): never {
    throw new RegistrationConflictError();
  }
}

@Controller('guarded')
@UseGuards(ServiceAuthGuard)
class GuardedController {
  @Get()
  public read(): { readonly ok: true } {
    return { ok: true };
  }
}

interface WriteCall {
  readonly stream: 'stdout' | 'stderr';
  readonly chunk: string;
}

describe('registration secrets (AUTH-033)', () => {
  const writes: WriteCall[] = [];
  let stdoutSpy: jest.SpyInstance;
  let stderrSpy: jest.SpyInstance;
  let opened: AuthTestApp | null = null;

  beforeEach(() => {
    writes.length = 0;
    emitMock.mockClear();
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

  afterEach(async () => {
    stdoutSpy.mockRestore();
    stderrSpy.mockRestore();
    if (opened !== null) {
      await opened.close();
      opened = null;
    }
  });

  function lines(stream: 'stdout' | 'stderr'): readonly string[] {
    return writes
      .filter((call) => call.stream === stream)
      .flatMap((call) => call.chunk.split('\n'))
      .filter((line) => line.trim() !== '');
  }

  function destinations(): string {
    return [
      ...lines('stdout'),
      ...lines('stderr'),
      ...emitMock.mock.calls.map((call) => call[1]),
    ].join('\n');
  }

  function records(): readonly Record<string, unknown>[] {
    return [...lines('stdout'), ...lines('stderr')].map(
      (line) => JSON.parse(line) as Record<string, unknown>,
    );
  }

  async function open(controllers: readonly Type<unknown>[]): Promise<void> {
    opened = await createAuthTestApp({
      providers: [ServiceJwtVerifier, { provide: CLOCK, useValue: systemClock }],
      controllers,
    });
  }

  function serverOf(app: AuthTestApp): Server {
    return app.app.getHttpServer() as Server;
  }

  it('does not leak synthetic secrets through stdout, stderr or telemetry', () => {
    const logger = new AuthLogger();

    logger.error('registration_failed', {
      code: 'DEPENDENCY_UNAVAILABLE',
      status: 503,
      traceId: 'trace-secrets-1234',
      password: MARKERS.password,
      credentials: { hash: MARKERS.hash, email: MARKERS.email },
      tokens: [MARKERS.serviceJwt, MARKERS.password],
      exception: new Error(`failed with ${MARKERS.password} and ${MARKERS.serviceJwt}`),
    });
    logger.log('registration_completed', { email: MARKERS.email, hash: MARKERS.hash });
    logger.error(new TypeError(`raw ${MARKERS.hash}`));

    const output = destinations();
    for (const marker of ALL_MARKERS) {
      expect(output).not.toContain(marker);
    }
  });

  it('keeps allowed correlation fields and only the error name', () => {
    const logger = new AuthLogger();

    logger.error('http_request_failed', {
      code: 'INTERNAL_ERROR',
      status: 500,
      traceId: 'trace-keep-1234',
      exception: new Error(`secret ${MARKERS.serviceJwt}`),
    });

    const [record] = records();
    expect(record?.context).toEqual({
      code: 'INTERNAL_ERROR',
      status: 500,
      traceId: 'trace-keep-1234',
    });
    expect(JSON.stringify(record)).not.toContain(MARKERS.serviceJwt);

    logger.error(new TypeError(`secret ${MARKERS.hash}`));
    const [, second] = records();
    expect(second?.message).toEqual({ name: 'TypeError', kind: 'error' });
    expect(JSON.stringify(second)).not.toContain(MARKERS.hash);
  });

  it('does not forward the raw error message in a 500 problem or its logs', async () => {
    await open([BoomController]);

    const response = await request(serverOf(opened as AuthTestApp))
      .get('/boom/unknown')
      .set('x-trace-id', 'trace-http-unknown');

    expect(response.status).toBe(500);
    const body = response.body as Record<string, unknown>;
    expect(body).toMatchObject({ status: 500, code: 'INTERNAL_ERROR', traceId: 'trace-http-unknown' });
    for (const marker of ALL_MARKERS) {
      expect(JSON.stringify(body)).not.toContain(marker);
      expect(destinations()).not.toContain(marker);
    }
    expect(destinations()).toContain('trace-http-unknown');
  });

  it('returns a safe problem for dependency and conflict failures', async () => {
    await open([BoomController]);
    const app = opened as AuthTestApp;

    const dependency = await request(serverOf(app)).get('/boom/dependency');
    expect(dependency.status).toBe(503);
    expect(dependency.headers['content-type']).toContain('application/problem+json');
    expect(dependency.body).toMatchObject({ status: 503, code: 'DEPENDENCY_UNAVAILABLE' });

    const conflict = await request(serverOf(app)).get('/boom/conflict');
    expect(conflict.status).toBe(409);
    expect(conflict.body).toMatchObject({ status: 409, code: 'REGISTRATION_CONFLICT' });
  });

  it('preserves the traceId when a guard rejects before the controller', async () => {
    await open([GuardedController]);

    const response = await request(serverOf(opened as AuthTestApp))
      .get('/guarded')
      .set('x-trace-id', 'trace-guard-secrets');

    expect(response.status).toBe(401);
    const body = response.body as Record<string, unknown>;
    expect(body).toMatchObject({ status: 401, traceId: 'trace-guard-secrets' });
    expect(response.headers['x-trace-id']).toBe('trace-guard-secrets');
    for (const marker of ALL_MARKERS) {
      expect(destinations()).not.toContain(marker);
    }
  });
});
