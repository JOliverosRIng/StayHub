import { CallHandler, ExecutionContext, type Request, type Response } from '@nestjs/common';
import { lastValueFrom, of, throwError } from 'rxjs';

import { TraceInterceptor } from '@gateway/interfaces/http/trace.interceptor';

interface RecordedSpan {
  name: string;
  attributes: Record<string, unknown>;
  status: { code: number } | undefined;
  events: string[];
  ended: boolean;
}

interface SpanHandle {
  setAttribute(key: string, value: unknown): void;
  setStatus(status: { code: number }): void;
  addEvent(event: string): void;
  end(): void;
}

interface SpanFactory {
  startSpan(
    name: string,
    options?: { attributes?: Record<string, unknown> },
  ): SpanHandle;
}

const spans: RecordedSpan[] = [];

jest.mock('@opentelemetry/api', () => {
  const actual = jest.requireActual<typeof import('@opentelemetry/api')>('@opentelemetry/api');
  return {
    ...actual,
    trace: {
      getTracer: (): SpanFactory => ({
        startSpan: (
          name: string,
          options: { attributes?: Record<string, unknown> } = {},
        ): SpanHandle => {
          const span: RecordedSpan = {
            name,
            attributes: options.attributes ?? {},
            status: undefined,
            events: [],
            ended: false,
          };
          spans.push(span);
          return {
            setAttribute(key: string, value: unknown): void {
              span.attributes[key] = value;
            },
            setStatus(status: { code: number }): void {
              span.status = status;
            },
            addEvent(event: string): void {
              span.events.push(event);
            },
            end(): void {
              span.ended = true;
            },
          };
        },
      }),
    },
  };
});

const request = (init: { method?: string; path?: string; traceId?: string }): Request => {
  const headers: Record<string, string> = {};
  if (init.traceId !== undefined) headers['x-trace-id'] = init.traceId;
  return {
    method: init.method ?? 'GET',
    path: init.path ?? '/api/v1/usuarios',
    header: (name: string): string | undefined => headers[name.toLowerCase()],
  } as unknown as Request;
};

interface FakeResponse extends Response {
  finish(): void;
  written: Record<string, string>;
}

const response = (): FakeResponse => {
  const written: Record<string, string> = {};
  const listeners: Record<string, () => void> = {};
  return {
    written,
    setHeader(name: string, value: string): void {
      written[name.toLowerCase()] = value;
    },
    statusCode: 200,
    once(event: string, listener: () => void): void {
      listeners[event] = listener;
    },
    finish(): void {
      listeners['finish']?.();
    },
  } as unknown as FakeResponse;
};

const context = (req: Request, res: Response): ExecutionContext =>
  ({
    switchToHttp: (): Record<string, () => unknown> => ({
      getRequest: () => req,
      getResponse: () => res,
    }),
    getHandler: () => function handler(): void {},
    getClass: () => class Controller {},
  }) as unknown as ExecutionContext;

const handler = (): CallHandler => ({ handle: () => of({ ok: true }) });
const failingHandler = (): CallHandler => ({
  handle: () => throwError(() => new Error('fallo')),
});

describe('TraceInterceptor (GW-012)', () => {
  let interceptor: TraceInterceptor;

  beforeEach(() => {
    spans.length = 0;
    interceptor = new TraceInterceptor();
  });

  it('devuelve la respuesta sin alterarla', async () => {
    const res = response();

    const result = await lastValueFrom(
      interceptor.intercept(context(request({}), res), handler()),
    );

    expect(result).toEqual({ ok: true });
  });

  it('propaga un traceId entrante valido en la cabecera de respuesta', async () => {
    const res = response();

    await lastValueFrom(
      interceptor.intercept(context(request({ traceId: 'trace-abcdefgh' }), res), handler()),
    );

    expect(res.written['x-trace-id']).toBe('trace-abcdefgh');
  });

  it('sustituye un traceId entrante con formato hostil', async () => {
    const res = response();

    await lastValueFrom(
      interceptor.intercept(
        context(request({ traceId: 'a'.repeat(400) }), res),
        handler(),
      ),
    );

    expect(res.written['x-trace-id']).toMatch(/^[A-Za-z0-9_-]{8,128}$/);
  });

  it('genera un traceId cuando la peticion no lo trae', async () => {
    const res = response();

    await lastValueFrom(interceptor.intercept(context(request({}), res), handler()));

    expect(res.written['x-trace-id']).toMatch(/^[A-Za-z0-9_-]{8,128}$/);
  });

  it('reutiliza el mismo traceId dentro de una peticion', async () => {
    const res = response();
    const req = request({});

    await lastValueFrom(interceptor.intercept(context(req, res), handler()));
    await lastValueFrom(interceptor.intercept(context(req, res), handler()));

    expect(res.written['x-trace-id']).toBeDefined();
  });

  it('abre un span con metodo, ruta y traceId', async () => {
    const res = response();

    await lastValueFrom(
      interceptor.intercept(
        context(request({ method: 'POST', path: '/api/v1/registro', traceId: 'trace-abcdefgh' }), res),
        handler(),
      ),
    );

    expect(spans).toHaveLength(1);
    expect(spans[0]?.attributes['http.method']).toBe('POST');
    expect(spans[0]?.attributes['http.route']).toBe('/api/v1/registro');
    expect(spans[0]?.attributes['trace.id']).toBe('trace-abcdefgh');
  });

  it('no incluye la query string ni cabeceras en el nombre del span', async () => {
    const res = response();

    await lastValueFrom(
      interceptor.intercept(
        context(
          {
            method: 'GET',
            path: '/api/v1/usuarios',
            originalUrl: '/api/v1/usuarios?correo=ana%40stayhub.example',
            url: '/api/v1/usuarios?correo=ana%40stayhub.example',
            header: () => undefined,
          } as unknown as Request,
          res,
        ),
        handler(),
      ),
    );

    expect(spans[0]?.name).not.toContain('ana@stayhub.example');
    expect(spans[0]?.name).not.toContain('?');
  });

  it('registra el status real y cierra el span al terminar la respuesta', async () => {
    const res = response();

    await lastValueFrom(interceptor.intercept(context(request({}), res), handler()));
    (res as unknown as { statusCode: number }).statusCode = 201;
    res.finish();

    expect(spans[0]?.attributes['http.status_code']).toBe(201);
    expect(spans[0]?.ended).toBe(true);
  });

  it('marca el span como error a partir de 500', async () => {
    const res = response();

    await lastValueFrom(interceptor.intercept(context(request({}), res), handler()));
    (res as unknown as { statusCode: number }).statusCode = 503;
    res.finish();

    expect(spans[0]?.status).toEqual({ code: 2 });
  });

  it('no marca el span como error en un 4xx', async () => {
    const res = response();

    await lastValueFrom(interceptor.intercept(context(request({}), res), handler()));
    (res as unknown as { statusCode: number }).statusCode = 404;
    res.finish();

    expect(spans[0]?.status).toBeUndefined();
  });

  it('deja propagar el error sin convertirlo', async () => {
    const res = response();

    await expect(
      lastValueFrom(interceptor.intercept(context(request({}), res), failingHandler())),
    ).rejects.toThrow('fallo');
  });
});
