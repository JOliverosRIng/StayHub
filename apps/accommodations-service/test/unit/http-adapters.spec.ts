import { Test } from '@nestjs/testing';
import { HttpException, type INestApplication, type LoggerService } from '@nestjs/common';
import type { Server } from 'node:http';
import request from 'supertest';
import { AppModule } from '../../src/app.module';
import { ACCOMMODATIONS_CONFIG } from '../../src/infrastructure/config/accommodations-config';
import { PrismaService } from '../../src/infrastructure/persistence/prisma/prisma.service';
import { configureHttp } from '../../src/interfaces/http/configure-http';
import { mapProblem } from '../../src/interfaces/http/problem.mapper';
import { AccommodationsLogger, type SafeLog } from '../../src/infrastructure/logging/accommodations-logger';
import { DomainError, type ErrorCode } from '../../src/domain/shared/domain-error';
import { testConfig } from '../fixtures/config.fixture';

const PROBLEM_KEYS = ['code', 'detail', 'errors', 'instance', 'status', 'title', 'traceId', 'type'];
const trace = 'b'.repeat(32);

describe('ACC-005/007 Problem Details mapping', () => {
  it.each([
    ['VALIDATION_ERROR', 400], ['VERSION_CONFLICT', 409], ['PUBLICATION_INCOMPLETE', 409], ['PHOTO_LIMIT_REACHED', 409],
    ['STATE_CONFLICT', 409], ['NOT_FOUND', 404], ['FORBIDDEN', 403], ['PHOTO_TOO_LARGE', 413], ['PHOTO_MEDIA_TYPE', 415], ['UNAVAILABLE', 503],
  ] as [ErrorCode, number][])('maps %s to %i with the stable code', (code, status) => {
    const problem = mapProblem(new DomainError(code, [{ field: 'rooms[0].id', code: 'INVALID_VALUE' }]), trace);
    expect(problem).toEqual({ type: 'about:blank', title: expect.any(String) as unknown, status, detail: expect.any(String) as unknown, instance: `urn:request:${trace}`, code, traceId: trace, errors: [{ field: 'rooms[0].id', code: 'INVALID_VALUE' }] });
  });

  it('maps framework HTTP errors to HTTP_<status> and hides unexpected errors as HTTP_500', () => {
    expect(mapProblem(new HttpException('person@example.test', 401), trace)).toMatchObject({ status: 401, code: 'HTTP_401', errors: [] });
    const internal = mapProblem(new Error('postgres://user:secret@host/accommodations_db'), trace);
    expect(internal).toMatchObject({ status: 500, code: 'HTTP_500' });
    expect(JSON.stringify(internal)).not.toMatch(/secret|postgres|person@/);
  });

  it('maps malformed JSON bodies to VALIDATION_ERROR without echoing the payload', () => {
    const parseError = Object.assign(new SyntaxError('Unexpected token s in {"secret"'), { type: 'entity.parse.failed', status: 400, body: '{"secret"' });
    const problem = mapProblem(parseError, trace);
    expect(problem).toMatchObject({ status: 400, code: 'VALIDATION_ERROR', errors: [{ field: 'body', code: 'INVALID_VALUE' }] });
    expect(JSON.stringify(problem)).not.toContain('secret');
  });

  it.each([['entity.too.large', 413], ['charset.unsupported', 415], ['encoding.unsupported', 415]])('maps JSON body-parser rejection %s to VALIDATION_ERROR on body', (type, status) => {
    expect(mapProblem(Object.assign(new Error('rejected'), { type, status }), trace)).toMatchObject({ status: 400, code: 'VALIDATION_ERROR', errors: [{ field: 'body', code: 'INVALID_VALUE' }] });
  });
});

describe('ACC-005/007 HTTP bootstrap, health and tracing (unit)', () => {
  let app: INestApplication; let server: Server; const ready = jest.fn(); const logs: SafeLog[] = [];
  beforeAll(async () => {
    const module = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(ACCOMMODATIONS_CONFIG).useValue(testConfig())
      .overrideProvider(PrismaService).useValue({ ready }).compile();
    app = module.createNestApplication({ logger: false });
    configureHttp(app, new AccommodationsLogger((record) => logs.push(record)));
    await app.init(); server = app.getHttpServer() as Server;
  });
  afterAll(async () => { await app?.close(); });
  beforeEach(() => { ready.mockReset(); logs.length = 0; });

  it('liveness does not depend on the database', async () => {
    ready.mockResolvedValue(false);
    await request(server).get('/health/live').expect(200, { status: 'live' });
    expect(ready).not.toHaveBeenCalled();
  });

  it('readiness reflects the database state as 200 or 503 Problem Details', async () => {
    ready.mockResolvedValue(true);
    await request(server).get('/health/ready').expect(200, { status: 'ready' });
    ready.mockResolvedValue(false);
    const down = await request(server).get('/health/ready').expect(503).expect('Content-Type', /application\/problem\+json/);
    expect(down.body as unknown).toMatchObject({ status: 503, code: 'HTTP_503' });
  });

  it('propagates a valid incoming trace id and replaces invalid ones', async () => {
    await request(server).get('/health/live').set('x-trace-id', trace).expect('x-trace-id', trace).expect('Cache-Control', 'no-store');
    const replaced = await request(server).get('/health/live').set('x-trace-id', 'not-a-trace').expect(200);
    expect(replaced.headers['x-trace-id']).toMatch(/^[0-9a-f]{32}$/);
    expect(replaced.headers['x-trace-id']).not.toBe('not-a-trace');
    expect(logs).toContainEqual(expect.objectContaining({ event: 'http_request', status: 200, service: 'accommodations-service' }));
  });

  it('answers unknown routes with exact Problem Details and the request trace', async () => {
    const response = await request(server).get('/unknown').set('x-trace-id', trace).expect(404).expect('Content-Type', /application\/problem\+json/);
    expect(Object.keys(response.body as object).sort()).toEqual(PROBLEM_KEYS);
    expect(response.body as unknown).toMatchObject({ status: 404, code: 'HTTP_404', traceId: trace, instance: `urn:request:${trace}`, errors: [] });
  });

  it('rejects malformed JSON strictly before any handler', async () => {
    const response = await request(server).post('/properties').set('Content-Type', 'application/json').send('{"name":').expect(400);
    expect(response.body as unknown).toMatchObject({ code: 'VALIDATION_ERROR', errors: [{ field: 'body', code: 'INVALID_VALUE' }] });
  });
});

describe('ACC-007 safe logging', () => {
  it('drops framework payloads and invalid trace ids', () => {
    const lines: SafeLog[] = []; const logger = new AccommodationsLogger((line) => lines.push(line));
    const framework: LoggerService = logger;
    framework.log('Bearer secret-token'); framework.error(new Error('postgres://user:secret@host')); framework.warn({ password: 'x' });
    logger.event('http_request', { traceId: 'person@example.test', status: 400, durationMs: 3 });
    expect(JSON.stringify(lines)).not.toMatch(/secret|password|person@|postgres/);
    expect(lines).toHaveLength(4);
    expect(lines[3]).toEqual({ event: 'http_request', level: 'info', service: 'accommodations-service', status: 400, durationMs: 3 });
  });
});
