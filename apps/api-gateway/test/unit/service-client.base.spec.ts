import { GatewayDependencyError } from '@gateway/application/errors/gateway-errors';
import type { CircuitPolicy } from '@gateway/infrastructure/config/gateway-config';
import {
  ServiceClientBase,
  type HttpFetch,
  type ServiceCall,
  type ServiceClientOptions,
  type ServiceTokenIssuer,
} from '@gateway/infrastructure/http/service-client.base';

interface Behavior {
  readonly status?: number;
  readonly body?: string;
  readonly headers?: Record<string, string>;
  readonly throws?: boolean;
  readonly hangs?: boolean;
}

interface CapturedCall {
  readonly url: string;
  readonly method: string;
  readonly headers: Headers;
  readonly body: string;
}

interface FetchStub {
  readonly fetch: HttpFetch;
  readonly calls: CapturedCall[];
  enqueue(behavior: Behavior): void;
}

function createFetchStub(initial: Behavior[] = []): FetchStub {
  const queue = [...initial];
  const calls: CapturedCall[] = [];

  const fetch: HttpFetch = async (input, init): Promise<Response> => {
    const headers = new Headers(init?.headers);
    const body = typeof init?.body === 'string' ? init.body : bytesToText(init?.body);
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    calls.push({ url, method: init?.method ?? 'GET', headers, body });

    const behavior = queue.shift() ?? { status: 200, body: '' };
    if (behavior.throws === true) {
      return Promise.reject(new Error('network down'));
    }
    if (behavior.hangs === true) {
      return new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener('abort', () => reject(new Error('aborted')));
      });
    }
    const responseInit: ResponseInit = { status: behavior.status ?? 200 };
    if (behavior.headers !== undefined) responseInit.headers = behavior.headers;
    return Promise.resolve(new Response(behavior.body ?? '', responseInit));
  };

  return {
    fetch,
    calls,
    enqueue(behavior: Behavior): void {
      queue.push(behavior);
    },
  };
}

function bytesToText(body: BodyInit | null | undefined): string {
  if (body instanceof Uint8Array) return new TextDecoder().decode(body);
  return '';
}

function textOf(bytes: Uint8Array): string {
  return new TextDecoder().decode(bytes);
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

const AUTH_CIRCUIT: CircuitPolicy = { timeoutMs: 40, failureThreshold: 5, resetMs: 1000 };

function baseOptions(overrides: Partial<ServiceClientOptions> = {}): ServiceClientOptions {
  return {
    dependency: 'auth',
    baseUrl: 'http://auth-service:3001',
    circuit: AUTH_CIRCUIT,
    requestHeaderAllowlist: ['accept-language'],
    maxRetries: 2,
    ...overrides,
  };
}

function call(overrides: Partial<ServiceCall> = {}): ServiceCall {
  return {
    method: 'GET',
    path: '/internal/v1/health',
    traceId: 'trace-abc-123',
    ...overrides,
  };
}

describe('ServiceClientBase (GW-018)', () => {
  it('adjunta el service JWT como Authorization Bearer y propaga el traceId', async () => {
    const stub = createFetchStub([{ status: 200, body: 'ok' }]);
    const { issuer, issued } = createIssuer();
    const client = new ServiceClientBase(baseOptions(), { serviceToken: issuer, fetch: stub.fetch });

    const result = await client.request(call());

    expect(issued()).toBe(1);
    const sent = stub.calls[0];
    expect(sent).toBeDefined();
    expect(sent?.url).toBe('http://auth-service:3001/internal/v1/health');
    expect(sent?.headers.get('authorization')).toBe('Bearer service-jwt-1');
    expect(sent?.headers.get('x-trace-id')).toBe('trace-abc-123');
    expect(result.status).toBe(200);
    expect(textOf(result.body)).toBe('ok');
  });

  it('emite un service JWT nuevo en cada intento y no reutiliza el anterior', async () => {
    const stub = createFetchStub([{ status: 503 }, { status: 200 }]);
    const { issuer, issued } = createIssuer();
    const client = new ServiceClientBase(baseOptions(), {
      serviceToken: issuer,
      fetch: stub.fetch,
      sleep: (): Promise<void> => Promise.resolve(),
    });

    await client.request(call());

    expect(issued()).toBe(2);
    expect(stub.calls[0]?.headers.get('authorization')).toBe('Bearer service-jwt-1');
    expect(stub.calls[1]?.headers.get('authorization')).toBe('Bearer service-jwt-2');
  });

  it('solo reenvia cabeceras del cliente incluidas en la allowlist', async () => {
    const stub = createFetchStub();
    const { issuer } = createIssuer();
    const client = new ServiceClientBase(baseOptions({ requestHeaderAllowlist: ['accept-language'] }), {
      serviceToken: issuer,
      fetch: stub.fetch,
    });

    await client.request(
      call({
        headers: {
          'accept-language': 'es-CO',
          'x-user-id': 'victim-42',
          'x-forwarded-for': '203.0.113.9',
          'x-service-token': 'forged',
        },
      }),
    );

    const sent = stub.calls[0]?.headers;
    expect(sent?.get('accept-language')).toBe('es-CO');
    expect(sent?.get('x-user-id')).toBeNull();
    expect(sent?.get('x-forwarded-for')).toBeNull();
    expect(sent?.get('x-service-token')).toBeNull();
  });

  it('no permite que el cliente sobreescriba Authorization ni x-trace-id via allowlist', async () => {
    const stub = createFetchStub();
    const { issuer } = createIssuer();
    const client = new ServiceClientBase(
      baseOptions({ requestHeaderAllowlist: ['authorization', 'x-trace-id'] }),
      { serviceToken: issuer, fetch: stub.fetch },
    );

    await client.request(
      call({ headers: { authorization: 'Bearer stolen', 'x-trace-id': 'spoofed' } }),
    );

    const sent = stub.calls[0]?.headers;
    expect(sent?.get('authorization')).toBe('Bearer service-jwt-1');
    expect(sent?.get('x-trace-id')).toBe('trace-abc-123');
  });

  it('envia el cuerpo con su content-type y la Idempotency-Key indicada', async () => {
    const stub = createFetchStub();
    const { issuer } = createIssuer();
    const client = new ServiceClientBase(baseOptions(), { serviceToken: issuer, fetch: stub.fetch });

    await client.request(
      call({
        method: 'POST',
        path: '/internal/v1/registrations',
        body: new TextEncoder().encode('{"role":"GUEST"}'),
        contentType: 'application/json',
        idempotencyKey: '9f1b1d2e-0000-4000-8000-000000000000',
      }),
    );

    const sent = stub.calls[0];
    expect(sent?.method).toBe('POST');
    expect(sent?.headers.get('content-type')).toBe('application/json');
    expect(sent?.headers.get('idempotency-key')).toBe('9f1b1d2e-0000-4000-8000-000000000000');
    expect(sent?.body).toBe('{"role":"GUEST"}');
  });

  it('convierte un timeout en GatewayDependencyError sin colgarse', async () => {
    const stub = createFetchStub([{ hangs: true }, { hangs: true }, { hangs: true }]);
    const { issuer } = createIssuer();
    const client = new ServiceClientBase(baseOptions({ circuit: { ...AUTH_CIRCUIT, timeoutMs: 15 } }), {
      serviceToken: issuer,
      fetch: stub.fetch,
      sleep: (): Promise<void> => Promise.resolve(),
    });

    await expect(client.request(call())).rejects.toBeInstanceOf(GatewayDependencyError);
  });

  it('reintenta un GET idempotente ante 503 y devuelve el exito posterior', async () => {
    const stub = createFetchStub([{ status: 503 }, { status: 200, body: 'recovered' }]);
    const { issuer } = createIssuer();
    const client = new ServiceClientBase(baseOptions(), {
      serviceToken: issuer,
      fetch: stub.fetch,
      sleep: (): Promise<void> => Promise.resolve(),
    });

    const result = await client.request(call());

    expect(stub.calls).toHaveLength(2);
    expect(result.status).toBe(200);
    expect(textOf(result.body)).toBe('recovered');
  });

  it('reintenta un GET ante error de transporte y luego resuelve', async () => {
    const stub = createFetchStub([{ throws: true }, { status: 200, body: 'ok' }]);
    const { issuer } = createIssuer();
    const client = new ServiceClientBase(baseOptions(), {
      serviceToken: issuer,
      fetch: stub.fetch,
      sleep: (): Promise<void> => Promise.resolve(),
    });

    const result = await client.request(call());

    expect(stub.calls).toHaveLength(2);
    expect(result.status).toBe(200);
  });

  it('no reintenta un POST no idempotente y devuelve el 503 una sola vez', async () => {
    const stub = createFetchStub([{ status: 503 }, { status: 200 }]);
    const { issuer } = createIssuer();
    const client = new ServiceClientBase(baseOptions(), {
      serviceToken: issuer,
      fetch: stub.fetch,
      sleep: (): Promise<void> => Promise.resolve(),
    });

    const result = await client.request(call({ method: 'POST', path: '/internal/v1/registrations' }));

    expect(stub.calls).toHaveLength(1);
    expect(result.status).toBe(503);
  });

  it('lanza GatewayDependencyError si un POST no idempotente falla en transporte', async () => {
    const stub = createFetchStub([{ throws: true }]);
    const { issuer } = createIssuer();
    const client = new ServiceClientBase(baseOptions(), {
      serviceToken: issuer,
      fetch: stub.fetch,
      sleep: (): Promise<void> => Promise.resolve(),
    });

    await expect(
      client.request(call({ method: 'POST', path: '/internal/v1/registrations' })),
    ).rejects.toBeInstanceOf(GatewayDependencyError);
    expect(stub.calls).toHaveLength(1);
  });

  it('reintenta un POST cuando lleva Idempotency-Key', async () => {
    const stub = createFetchStub([{ status: 503 }, { status: 201, body: 'created' }]);
    const { issuer } = createIssuer();
    const client = new ServiceClientBase(baseOptions(), {
      serviceToken: issuer,
      fetch: stub.fetch,
      sleep: (): Promise<void> => Promise.resolve(),
    });

    const result = await client.request(
      call({
        method: 'POST',
        path: '/internal/v1/registrations',
        idempotencyKey: '9f1b1d2e-0000-4000-8000-000000000000',
      }),
    );

    expect(stub.calls).toHaveLength(2);
    expect(result.status).toBe(201);
  });

  it('no reintenta ante un 4xx ni lo trata como fallo de dependencia', async () => {
    const stub = createFetchStub([{ status: 409, body: 'conflict' }, { status: 200 }]);
    const { issuer } = createIssuer();
    const client = new ServiceClientBase(baseOptions(), {
      serviceToken: issuer,
      fetch: stub.fetch,
      sleep: (): Promise<void> => Promise.resolve(),
    });

    const result = await client.request(call());

    expect(stub.calls).toHaveLength(1);
    expect(result.status).toBe(409);
  });

  it('abre el circuito tras superar el umbral y falla rapido sin llamar al upstream', async () => {
    const stub = createFetchStub();
    const { issuer } = createIssuer();
    let clock = 0;
    const client = new ServiceClientBase(
      baseOptions({ circuit: { timeoutMs: 40, failureThreshold: 2, resetMs: 1000 }, maxRetries: 0 }),
      {
        serviceToken: issuer,
        fetch: stub.fetch,
        now: (): number => clock,
        sleep: (): Promise<void> => Promise.resolve(),
      },
    );

    stub.enqueue({ throws: true });
    stub.enqueue({ throws: true });
    const post = (): ServiceCall => call({ method: 'POST', path: '/internal/v1/registrations' });

    await expect(client.request(post())).rejects.toBeInstanceOf(GatewayDependencyError);
    await expect(client.request(post())).rejects.toBeInstanceOf(GatewayDependencyError);
    expect(stub.calls).toHaveLength(2);

    // Circuito abierto: la tercera llamada no debe tocar el upstream.
    await expect(client.request(post())).rejects.toBeInstanceOf(GatewayDependencyError);
    expect(stub.calls).toHaveLength(2);

    // Tras el resetMs pasa a half-open y un exito vuelve a cerrar el circuito.
    clock = 1500;
    stub.enqueue({ status: 200, body: 'up' });
    const recovered = await client.request(call());
    expect(recovered.status).toBe(200);
    expect(stub.calls).toHaveLength(3);
  });

  it('filtra las cabeceras de respuesta a la allowlist configurada', async () => {
    const stub = createFetchStub([
      {
        status: 503,
        headers: {
          'content-type': 'application/problem+json',
          'retry-after': '30',
          'set-cookie': 'session=leak',
          server: 'internal-node-1',
        },
      },
    ]);
    const { issuer } = createIssuer();
    const client = new ServiceClientBase(baseOptions({ maxRetries: 0 }), {
      serviceToken: issuer,
      fetch: stub.fetch,
    });

    const result = await client.request(call({ method: 'POST', path: '/internal/v1/registrations' }));

    expect(result.headers['content-type']).toBe('application/problem+json');
    expect(result.headers['retry-after']).toBe('30');
    expect(result.headers['set-cookie']).toBeUndefined();
    expect(result.headers['server']).toBeUndefined();
  });
});
