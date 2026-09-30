import {
  createServer,
  type IncomingHttpHeaders,
  type IncomingMessage,
  type Server,
  type ServerResponse,
} from 'node:http';
import { Readable } from 'node:stream';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

import { HttpException, PayloadTooLargeException } from '@nestjs/common';

import { GatewayDependencyError } from '@gateway/application/errors/gateway-errors';
import {
  UsersProfileClient,
  type ProfileMultipart,
} from '@gateway/infrastructure/http/users-profile.client';
import type { GatewayConfig } from '@gateway/infrastructure/config/gateway-config';
import { PHOTO_MAX_BYTES, photoByteLimit } from '@gateway/modules/users/profile-streaming.interceptor';

import { createTestGatewayConfig } from '../support/gateway-config-fixture';

/**
 * GW-057 — Contrato consumer Gateway → Users (RQ-01, FR-011–FR-024, constitución §VII).
 *
 * Ejerce el cliente REAL de GW-046 (`UsersProfileClient`) contra un stub que hace de provider según
 * `contracts/openapi-users-service.yaml`, y verifica ambos lados del contrato:
 *
 *  - Request: hacia Users viaja el **bearer YA validado del usuario** (`Authorization: Bearer`,
 *    esquema `bearerAuth`, NO service JWT), el `x-trace-id`, y en PATCH el cuerpo `multipart/form-data`
 *    tal cual (incluida una foto de EXACTAMENTE 5.000.000 bytes). Nunca se envía `Idempotency-Key`.
 *  - Response: 200 se interpreta (perfil / bytes de la foto) y 400/401/403/404/409/413/415 se
 *    traducen al estado correcto (GW-019); una caída del provider falla cerrado en 503 sin cuerpo
 *    parcial.
 *
 * Además comprueba el comportamiento de streaming de GW-047 (`photoByteLimit`): pasa exactamente
 * 5.000.000 bytes, corta con 413 en 5.000.001 y reenvía en chunks sin bufferizar el cuerpo completo.
 *
 * Al final escribe el artefacto pact determinista para que G2 lo verifique como provider; la
 * verificación real contra el Users desplegado es GW-059. No se duplica cliente ni interceptor.
 */

const CONSUMER = 'stayhub-api-gateway';
const PROVIDER = 'stayhub-users-service';
const VALIDATED_BEARER = 'user.access.jwt.validated';
const TRACE_ID = 'trace-consumer-users-0001';
const USER_ID = '11111111-1111-4111-8111-111111111111';

const PROFILE_PATH = `/internal/v1/users/${USER_ID}/profile`;
const PHOTO_PATH = `${PROFILE_PATH}/photo`;
const JSON_CT = 'application/json';
const PROBLEM_CT = 'application/problem+json';
const JPEG_CT = 'image/jpeg';

const ARTIFACT_DIR = resolve(__dirname, 'pacts');
const ARTIFACT_PATH = join(ARTIFACT_DIR, `${CONSUMER}-${PROVIDER}.json`);

const USERS_PROFILE = {
  id: USER_ID,
  name: 'Ada Lovelace',
  email: 'ada@stayhub.test',
  role: 'GUEST',
  phone: null,
  preferences: null,
  photoUrl: null,
  version: 1,
};

function problem(status: number, code: string): Record<string, unknown> {
  return {
    type: `https://contracts.stayhub.internal/errors/${code}`,
    title: code,
    status,
    detail: 'Documented failure of the internal Users operation.',
    instance: PROFILE_PATH,
    code,
    traceId: TRACE_ID,
  };
}

function multipart(photoBytes: number): ProfileMultipart {
  const boundary = 'usersConsumerBoundary';
  const head = Buffer.from(
    `--${boundary}\r\n` +
      'Content-Disposition: form-data; name="profile"\r\n' +
      'Content-Type: application/json\r\n\r\n' +
      `${JSON.stringify({ expectedVersion: 1, name: 'Grace Hopper' })}\r\n` +
      `--${boundary}\r\n` +
      'Content-Disposition: form-data; name="photo"; filename="p.jpg"\r\n' +
      'Content-Type: image/jpeg\r\n\r\n',
  );
  const photo = Buffer.alloc(photoBytes, 0x27);
  const tail = Buffer.from(`\r\n--${boundary}--\r\n`);
  return { body: Buffer.concat([head, photo, tail]), contentType: `multipart/form-data; boundary=${boundary}` };
}

const SMALL_MULTIPART = multipart(1_000);
const EXACT_MULTIPART = multipart(PHOTO_MAX_BYTES);

type Op = 'getProfile' | 'updateProfile' | 'getPhoto';
type Expectation = 'ok' | 'throws' | 'failsClosed';

interface DriveCase {
  readonly description: string;
  readonly op: Op;
  readonly path: string;
  readonly expect: Expectation;
  readonly status: number;
  readonly contentType: string;
  readonly responseBody: Record<string, unknown>;
  readonly multipart?: ProfileMultipart;
}

const DRIVE: readonly DriveCase[] = [
  {
    description: 'GET profile returns the profile (200)',
    op: 'getProfile',
    path: PROFILE_PATH,
    expect: 'ok',
    status: 200,
    contentType: JSON_CT,
    responseBody: USERS_PROFILE,
  },
  {
    description: 'GET profile is rejected without a valid bearer (401)',
    op: 'getProfile',
    path: PROFILE_PATH,
    expect: 'throws',
    status: 401,
    contentType: PROBLEM_CT,
    responseBody: problem(401, 'BEARER_REJECTED'),
  },
  {
    description: 'GET profile is forbidden for another identity (403)',
    op: 'getProfile',
    path: PROFILE_PATH,
    expect: 'throws',
    status: 403,
    contentType: PROBLEM_CT,
    responseBody: problem(403, 'PROFILE_ACCESS_FORBIDDEN'),
  },
  {
    description: 'GET profile is missing (404)',
    op: 'getProfile',
    path: PROFILE_PATH,
    expect: 'throws',
    status: 404,
    contentType: PROBLEM_CT,
    responseBody: problem(404, 'PROFILE_NOT_FOUND'),
  },
  {
    description: 'GET profile fails closed when Users is unavailable (503)',
    op: 'getProfile',
    path: PROFILE_PATH,
    expect: 'failsClosed',
    status: 503,
    contentType: PROBLEM_CT,
    responseBody: problem(503, 'DEPENDENCY_UNAVAILABLE'),
  },
  {
    description: 'PATCH profile is rejected as invalid (400)',
    op: 'updateProfile',
    path: PROFILE_PATH,
    expect: 'throws',
    status: 400,
    contentType: PROBLEM_CT,
    responseBody: problem(400, 'VALIDATION_ERROR'),
    multipart: SMALL_MULTIPART,
  },
  {
    description: 'PATCH profile conflicts on version or email (409)',
    op: 'updateProfile',
    path: PROFILE_PATH,
    expect: 'throws',
    status: 409,
    contentType: PROBLEM_CT,
    responseBody: problem(409, 'PROFILE_CONFLICT'),
    multipart: SMALL_MULTIPART,
  },
  {
    description: 'PATCH profile rejects an oversized photo (413)',
    op: 'updateProfile',
    path: PROFILE_PATH,
    expect: 'throws',
    status: 413,
    contentType: PROBLEM_CT,
    responseBody: problem(413, 'PHOTO_TOO_LARGE'),
    multipart: SMALL_MULTIPART,
  },
  {
    description: 'PATCH profile rejects an unsupported photo type (415)',
    op: 'updateProfile',
    path: PROFILE_PATH,
    expect: 'throws',
    status: 415,
    contentType: PROBLEM_CT,
    responseBody: problem(415, 'UNSUPPORTED_MEDIA_TYPE'),
    multipart: SMALL_MULTIPART,
  },
  {
    description: 'GET photo is missing (404)',
    op: 'getPhoto',
    path: PHOTO_PATH,
    expect: 'throws',
    status: 404,
    contentType: PROBLEM_CT,
    responseBody: problem(404, 'PHOTO_NOT_FOUND'),
  },
];

interface RecordedRequest {
  readonly method: string;
  readonly path: string;
  readonly headers: IncomingHttpHeaders;
  readonly bodyLength: number;
}

interface Stub {
  readonly server: Server;
  listen(): Promise<void>;
  baseUrl(): string;
  reply(status: number, body: Buffer | Record<string, unknown>, contentType: string): void;
  requests(): readonly RecordedRequest[];
  reset(): void;
}

function createStub(): Stub {
  const state = {
    requests: [] as RecordedRequest[],
    next: { status: 200, body: Buffer.from('{}'), contentType: JSON_CT },
  };
  const server = createServer((incoming: IncomingMessage, response: ServerResponse) => {
    const chunks: Buffer[] = [];
    incoming.on('data', (chunk: Buffer) => chunks.push(chunk));
    incoming.on('end', () => {
      state.requests.push({
        method: incoming.method ?? '',
        path: incoming.url ?? '',
        headers: incoming.headers,
        bodyLength: Buffer.concat(chunks).length,
      });
      response.writeHead(state.next.status, { 'content-type': state.next.contentType });
      response.end(state.next.body);
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
      state.next = {
        status,
        body: Buffer.isBuffer(body) ? body : Buffer.from(JSON.stringify(body)),
        contentType,
      };
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

function usersClient(): UsersProfileClient {
  const cfg: GatewayConfig = { ...config, usersBaseUrl: stub.baseUrl() };
  return new UsersProfileClient(cfg, { issue: (): Promise<string> => Promise.resolve('') }, instant);
}

function context(): { traceId: string; bearer: string } {
  return { traceId: TRACE_ID, bearer: VALIDATED_BEARER };
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

function assertCommonRequest(recorded: RecordedRequest | undefined, path: string): void {
  expect(recorded).toBeDefined();
  expect(recorded?.path).toBe(path);
  expect(recorded?.headers['authorization']).toBe(`Bearer ${VALIDATED_BEARER}`);
  expect(recorded?.headers['x-trace-id']).toBe(TRACE_ID);
  expect(String(recorded?.headers['accept'])).toContain('application/json');
  expect(recorded?.headers['idempotency-key']).toBeUndefined();
}

describe('Contrato consumer Gateway → Users (GW-057)', () => {
  beforeAll(async () => {
    await stub.listen();
  });

  afterAll(async () => {
    await new Promise<void>((resolve) => stub.server.close(() => resolve()));
  });

  beforeEach(() => stub.reset());

  describe.each(DRIVE)('$description', (drive) => {
    it('el Gateway reenvía el bearer validado y trata la respuesta', async () => {
      stub.reply(drive.status, drive.responseBody, drive.contentType);
      const client = usersClient();

      const run = (): Promise<unknown> => {
        if (drive.op === 'getProfile') return client.getProfile(USER_ID, context());
        if (drive.op === 'getPhoto') return client.getProfilePhoto(USER_ID, context());
        return client.updateProfile(USER_ID, context(), drive.multipart ?? SMALL_MULTIPART);
      };

      if (drive.expect === 'ok') {
        await expect(run()).resolves.toEqual(drive.responseBody);
      } else {
        const status = await statusOfRejection(run);
        expect(status).toBe(drive.expect === 'failsClosed' ? 503 : drive.status);
      }

      const first = stub.requests()[0];
      assertCommonRequest(first, drive.path);
      expect(first?.method).toBe(drive.op === 'updateProfile' ? 'PATCH' : 'GET');
      if (drive.op === 'updateProfile') {
        expect(String(first?.headers['content-type'])).toContain('multipart/form-data; boundary=');
        expect(first?.bodyLength).toBe((drive.multipart ?? SMALL_MULTIPART).body.length);
      } else {
        expect(first?.bodyLength).toBe(0);
      }
    });
  });

  it('PATCH perfil reenvía el multipart con foto de EXACTAMENTE 5.000.000 bytes (200)', async () => {
    stub.reply(200, USERS_PROFILE, JSON_CT);
    const client = usersClient();

    await expect(client.updateProfile(USER_ID, context(), EXACT_MULTIPART)).resolves.toEqual(
      USERS_PROFILE,
    );

    const first = stub.requests()[0];
    assertCommonRequest(first, PROFILE_PATH);
    expect(first?.method).toBe('PATCH');
    expect(String(first?.headers['content-type'])).toContain('multipart/form-data; boundary=');
    // El cuerpo reenviado contiene la foto de exactamente 5.000.000 bytes (más las partes multipart).
    expect(first?.bodyLength).toBe(EXACT_MULTIPART.body.length);
    expect(EXACT_MULTIPART.body.length).toBeGreaterThan(PHOTO_MAX_BYTES);
  });

  it('GET foto devuelve los bytes de la imagen (200)', async () => {
    const jpeg = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46]);
    stub.reply(200, jpeg, JPEG_CT);
    const client = usersClient();

    const photo = await client.getProfilePhoto(USER_ID, context());
    expect(photo.contentType).toBe(JPEG_CT);
    expect(Buffer.from(photo.bytes)).toEqual(jpeg);

    assertCommonRequest(stub.requests()[0], PHOTO_PATH);
    expect(stub.requests()[0]?.method).toBe('GET');
  });

  describe('streaming de la foto (GW-047) sin bufferizar el cuerpo completo', () => {
    async function pipeThrough(totalBytes: number): Promise<{ emitted: number; error: unknown }> {
      const limiter = photoByteLimit();
      const chunks: Buffer[] = [];
      let error: unknown;
      const done = new Promise<void>((resolvePromise) => {
        limiter.on('data', (chunk: Buffer) => chunks.push(chunk));
        limiter.on('error', (err: unknown) => {
          error = err;
          resolvePromise();
        });
        limiter.on('end', () => resolvePromise());
      });
      const source = Readable.from(chunksOf(totalBytes, 100_000));
      source.pipe(limiter);
      await done;
      return { emitted: chunks.reduce((sum, chunk) => sum + chunk.length, 0), error };
    }

    it('pasa exactamente 5.000.000 bytes sin cortar', async () => {
      const { emitted, error } = await pipeThrough(PHOTO_MAX_BYTES);
      expect(error).toBeUndefined();
      expect(emitted).toBe(PHOTO_MAX_BYTES);
    });

    it('corta con 413 en 5.000.001 bytes emitiendo como máximo el límite', async () => {
      const { emitted, error } = await pipeThrough(PHOTO_MAX_BYTES + 1);
      expect(error).toBeInstanceOf(PayloadTooLargeException);
      expect((error as PayloadTooLargeException).getStatus()).toBe(413);
      expect(emitted).toBeLessThanOrEqual(PHOTO_MAX_BYTES);
    });

    it('reenvía en chunks: emite datos antes de recibir el cuerpo completo', async () => {
      const limiter = photoByteLimit();
      const firstChunk = new Promise<Buffer>((resolvePromise) => {
        limiter.once('data', (chunk: Buffer) => resolvePromise(chunk));
      });
      limiter.write(Buffer.alloc(1_000, 0x27));
      const chunk = await firstChunk; // llega sin haber llamado a end(): no hay buffering total
      expect(chunk.length).toBe(1_000);
      limiter.destroy();
    });
  });

  it('genera el artefacto pact determinista para la verificación del provider (G2, GW-059)', () => {
    const bearerHeaders = {
      authorization: `Bearer ${VALIDATED_BEARER}`,
      'x-trace-id': TRACE_ID,
      accept: 'application/json',
    };
    const multipartDescriptor = {
      contentType: 'multipart/form-data',
      parts: [
        { name: 'profile', contentType: 'application/json' },
        { name: 'photo', contentType: 'image/jpeg', maxBytes: PHOTO_MAX_BYTES, streaming: true },
      ],
    };

    const interactions = [
      ...DRIVE.map((drive) => ({
        description: drive.description,
        request: {
          method: drive.op === 'updateProfile' ? 'PATCH' : 'GET',
          path: drive.path,
          headers:
            drive.op === 'updateProfile'
              ? { ...bearerHeaders, 'content-type': 'multipart/form-data' }
              : bearerHeaders,
          body: drive.op === 'updateProfile' ? multipartDescriptor : null,
        },
        response: {
          status: drive.status,
          headers: { 'content-type': drive.contentType },
          body: drive.responseBody,
        },
      })),
      {
        description: 'PATCH profile with a photo of exactly 5,000,000 bytes (200)',
        request: {
          method: 'PATCH',
          path: PROFILE_PATH,
          headers: { ...bearerHeaders, 'content-type': 'multipart/form-data' },
          body: multipartDescriptor,
        },
        response: { status: 200, headers: { 'content-type': JSON_CT }, body: USERS_PROFILE },
      },
      {
        description: 'GET photo streams the image bytes (200)',
        request: { method: 'GET', path: PHOTO_PATH, headers: bearerHeaders, body: null },
        response: {
          status: 200,
          headers: { 'content-type': JPEG_CT },
          body: { encoding: 'binary', streaming: true, maxBytes: PHOTO_MAX_BYTES },
        },
      },
    ];

    const pact = {
      consumer: { name: CONSUMER },
      provider: { name: PROVIDER },
      metadata: {
        pactSpecification: { version: '3.0.0' },
        generatedBy: 'GW-057',
        alignedWith: 'specs/001-fundamentos-identidad/contracts/openapi-users-service.yaml',
        photoMaxBytes: PHOTO_MAX_BYTES,
        streaming: 'photo is forwarded chunked, capped at photoMaxBytes without full buffering (GW-047)',
      },
      interactions,
    };

    mkdirSync(ARTIFACT_DIR, { recursive: true });
    writeFileSync(ARTIFACT_PATH, `${JSON.stringify(pact, null, 2)}\n`);

    const written = JSON.parse(readFileSync(ARTIFACT_PATH, 'utf8')) as typeof pact;
    expect(written.consumer.name).toBe(CONSUMER);
    expect(written.provider.name).toBe(PROVIDER);
    expect(written.metadata.photoMaxBytes).toBe(5_000_000);

    const paths = new Set(written.interactions.map((i) => i.request.path));
    expect(paths).toEqual(new Set([PROFILE_PATH, PHOTO_PATH]));

    const statuses = new Set(written.interactions.map((i) => i.response.status));
    expect(statuses).toEqual(new Set([200, 400, 401, 403, 404, 409, 413, 415, 503]));
  });
});

function* chunksOf(total: number, size: number): Generator<Buffer> {
  let remaining = total;
  while (remaining > 0) {
    const next = Math.min(size, remaining);
    yield Buffer.alloc(next, 0x27);
    remaining -= next;
  }
}
