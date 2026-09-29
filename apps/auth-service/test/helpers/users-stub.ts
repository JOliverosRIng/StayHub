import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import type { AddressInfo } from 'node:net';

export type UsersStubRole = 'GUEST' | 'OWNER' | 'ADMIN';
export type UsersStubStatus = 'PENDING' | 'ACTIVE' | 'CANCELLED';

export interface UsersStubUser {
  readonly registrationId: string;
  readonly userId: string;
  readonly name: string;
  readonly email: string;
  readonly role: UsersStubRole;
  readonly status: UsersStubStatus;
}

export interface UsersStubRequest {
  readonly method: string;
  readonly path: string;
  readonly hasServiceAuthorization: boolean;
  readonly idempotencyKey?: string;
  readonly traceId?: string;
  readonly body?: unknown;
}

export interface UsersStubFailure {
  readonly methods?: readonly string[];
  readonly path?: string;
  readonly pathEndsWith?: string;
  readonly mode: 'before' | 'after';
  readonly status?: number;
  readonly delayMs?: number;
}

export interface UsersStubOptions {
  readonly requireServiceAuthorization?: boolean;
  readonly verifyServiceToken?: (token: string) => Promise<boolean>;
}

const DEFAULT_FAILURE_STATUS = 503;

export class UsersStub {
  private server: Server | null = null;
  private url: string | null = null;
  private readonly users = new Map<string, UsersStubUser>();
  private readonly emails = new Map<string, string>();
  private readonly captured: UsersStubRequest[] = [];
  private failures: UsersStubFailure[] = [];

  public constructor(private readonly options: UsersStubOptions = {}) {}

  public async start(): Promise<string> {
    if (this.server !== null) return this.requireUrl();
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
    return this.requireUrl();
  }

  public get requests(): readonly UsersStubRequest[] {
    return this.captured;
  }

  public seed(user: UsersStubUser): void {
    this.users.set(user.registrationId, user);
    this.emails.set(user.email.toLowerCase(), user.registrationId);
  }

  public find(registrationId: string): UsersStubUser | null {
    return this.users.get(registrationId) ?? null;
  }

  public failNext(failure: UsersStubFailure): void {
    this.failures.push(failure);
  }

  public reset(): void {
    this.users.clear();
    this.emails.clear();
    this.captured.length = 0;
    this.failures.length = 0;
  }

  public async stop(): Promise<void> {
    const server = this.server;
    this.server = null;
    this.url = null;
    if (server === null) return;
    await new Promise<void>((resolve, reject) => {
      server.close((error) => (error === undefined ? resolve() : reject(error)));
    });
  }

  private requireUrl(): string {
    if (this.url === null) throw new Error('Users stub is not started');
    return this.url;
  }

  private async handle(request: IncomingMessage, response: ServerResponse): Promise<void> {
    const chunks: Buffer[] = [];
    for await (const chunk of request) chunks.push(chunk as Buffer);
    const rawBody = Buffer.concat(chunks).toString('utf8');
    const parsedBody = rawBody === '' ? undefined : safeJson(rawBody);
    const authorization = request.headers.authorization;
    const captured: UsersStubRequest = {
      method: request.method ?? 'GET',
      path: request.url ?? '/',
      hasServiceAuthorization: typeof authorization === 'string' && authorization.startsWith('Bearer '),
      ...(typeof request.headers['idempotency-key'] === 'string'
        ? { idempotencyKey: request.headers['idempotency-key'] }
        : {}),
      ...(typeof request.headers['x-trace-id'] === 'string'
        ? { traceId: request.headers['x-trace-id'] }
        : {}),
      ...(parsedBody === undefined ? {} : { body: parsedBody }),
    };
    this.captured.push(captured);

    if (this.options.requireServiceAuthorization === true) {
      const token =
        typeof authorization === 'string' && authorization.startsWith('Bearer ')
          ? authorization.slice('Bearer '.length)
          : null;
      const valid =
        token !== null &&
        (this.options.verifyServiceToken === undefined ||
          (await this.options.verifyServiceToken(token)));
      if (!valid) {
        this.respond(response, 401, { code: 'SERVICE_UNAUTHENTICATED' });
        return;
      }
    }

    const failure = this.takeFailure(captured);
    if (failure !== null && failure.mode === 'before') {
      await delay(failure.delayMs ?? 0);
      this.respond(response, failure.status ?? DEFAULT_FAILURE_STATUS, { code: 'STUB_INJECTED_FAILURE' });
      return;
    }

    const result = this.route(captured);
    if (failure !== null) {
      await delay(failure.delayMs ?? 0);
      if (result.kind === 'mutated') this.commit(result.next);
      this.respond(response, failure.status ?? DEFAULT_FAILURE_STATUS, { code: 'STUB_INJECTED_FAILURE' });
      return;
    }
    if (result.kind === 'mutated') this.commit(result.next);
    this.respond(response, result.status, result.body);
  }

  private route(request: UsersStubRequest): StubRouteResult {
    const segments = request.path.split('?')[0]?.split('/').filter((part) => part !== '') ?? [];
    const method = request.method.toUpperCase();

    if (method === 'POST' && samePath(segments, ['internal', 'v1', 'registrations'])) {
      const body = asRecord(request.body);
      if (body === null) return { kind: 'response', status: 400, body: { code: 'INVALID_BODY' } };
      const registrationId = stringField(body, 'registrationId');
      const userId = stringField(body, 'userId');
      const name = stringField(body, 'name');
      const email = stringField(body, 'email');
      const role = stringField(body, 'role');
      if (registrationId === null || userId === null || name === null || email === null || role === null) {
        return { kind: 'response', status: 400, body: { code: 'INVALID_BODY' } };
      }
      const existing = this.users.get(registrationId);
      if (existing !== undefined) {
        return { kind: 'response', status: 200, body: summary(existing) };
      }
      if (this.emails.has(email.toLowerCase())) {
        return { kind: 'response', status: 409, body: { code: 'EMAIL_CONFLICT' } };
      }
      const next: UsersStubUser = {
        registrationId,
        userId,
        name,
        email,
        role: role as UsersStubRole,
        status: 'PENDING',
      };
      return { kind: 'mutated', next, status: 201, body: summary(next) };
    }

    if (method === 'GET' && segments.length === 4 && samePath(segments.slice(0, 3), ['internal', 'v1', 'registrations'])) {
      const user = this.users.get(segments[3] ?? '');
      if (user === undefined) return { kind: 'response', status: 404, body: { code: 'REGISTRATION_NOT_FOUND' } };
      return { kind: 'response', status: 200, body: summary(user) };
    }

    if (
      method === 'POST' &&
      segments.length === 5 &&
      samePath(segments.slice(0, 3), ['internal', 'v1', 'registrations']) &&
      segments[4] === 'activate'
    ) {
      const user = this.users.get(segments[3] ?? '');
      if (user === undefined) return { kind: 'response', status: 404, body: { code: 'REGISTRATION_NOT_FOUND' } };
      if (user.status === 'CANCELLED') return { kind: 'response', status: 409, body: { code: 'REGISTRATION_CANCELLED' } };
      const next: UsersStubUser = { ...user, status: 'ACTIVE' };
      return { kind: 'mutated', next, status: 200, body: summary(next) };
    }

    if (
      method === 'POST' &&
      segments.length === 5 &&
      samePath(segments.slice(0, 3), ['internal', 'v1', 'registrations']) &&
      segments[4] === 'cancel'
    ) {
      const user = this.users.get(segments[3] ?? '');
      if (user === undefined) return { kind: 'response', status: 404, body: { code: 'REGISTRATION_NOT_FOUND' } };
      if (user.status === 'ACTIVE') return { kind: 'response', status: 409, body: { code: 'REGISTRATION_ACTIVE' } };
      const next: UsersStubUser = { ...user, status: 'CANCELLED' };
      return { kind: 'mutated', next, status: 204, body: undefined };
    }

    if (
      method === 'POST' &&
      samePath(segments, ['internal', 'v1', 'login-identities', 'resolve'])
    ) {
      const body = asRecord(request.body);
      const email = body === null ? null : stringField(body, 'email');
      if (email === null) return { kind: 'response', status: 400, body: { code: 'INVALID_BODY' } };
      const registrationId = this.emails.get(email.toLowerCase());
      const user = registrationId === undefined ? undefined : this.users.get(registrationId);
      if (user === undefined || user.status !== 'ACTIVE') {
        return { kind: 'response', status: 404, body: { code: 'IDENTITY_NOT_FOUND' } };
      }
      return {
        kind: 'response',
        status: 200,
        body: { userId: user.userId, role: user.role, status: 'ACTIVE' },
      };
    }

    return { kind: 'response', status: 404, body: { code: 'ROUTE_NOT_FOUND' } };
  }

  private takeFailure(request: UsersStubRequest): UsersStubFailure | null {
    const path = request.path.split('?')[0] ?? '';
    const index = this.failures.findIndex((failure) => {
      if (failure.methods !== undefined && !failure.methods.includes(request.method.toUpperCase())) {
        return false;
      }
      if (failure.path !== undefined && path !== failure.path) return false;
      if (failure.pathEndsWith !== undefined && !path.endsWith(failure.pathEndsWith)) return false;
      return true;
    });
    if (index === -1) return null;
    const [failure] = this.failures.splice(index, 1);
    return failure ?? null;
  }

  private commit(user: UsersStubUser): void {
    this.users.set(user.registrationId, user);
    this.emails.set(user.email.toLowerCase(), user.registrationId);
  }

  private respond(response: ServerResponse, status: number, body: unknown): void {
    if (response.headersSent) return;
    if (body === undefined) {
      response.statusCode = status;
      response.end();
      return;
    }
    const payload = JSON.stringify(body);
    response.writeHead(status, {
      'content-type': 'application/problem+json',
      'content-length': Buffer.byteLength(payload),
    });
    response.end(payload);
  }
}

type StubRouteResult =
  | { readonly kind: 'response'; readonly status: number; readonly body: unknown }
  | { readonly kind: 'mutated'; readonly next: UsersStubUser; readonly status: number; readonly body: unknown };

function summary(user: UsersStubUser): Record<string, string> {
  return {
    id: user.userId,
    name: user.name,
    email: user.email,
    role: user.role,
    status: user.status,
  };
}

function samePath(segments: readonly string[], expected: readonly string[]): boolean {
  return segments.length === expected.length && expected.every((part, index) => segments[index] === part);
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function stringField(record: Record<string, unknown>, key: string): string | null {
  const value = record[key];
  return typeof value === 'string' && value !== '' ? value : null;
}

function safeJson(raw: string): unknown {
  try {
    return JSON.parse(raw) as unknown;
  } catch {
    return raw;
  }
}

async function delay(millis: number): Promise<void> {
  if (millis <= 0) return;
  await new Promise<void>((resolve) => setTimeout(resolve, millis));
}
