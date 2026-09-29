import { ArgumentsHost, BadRequestException, NotFoundException } from '@nestjs/common';
import type { Request, Response } from 'express';

import { ProblemDetailsFilter } from '@gateway/interfaces/http/problem.filter';

interface RecordedResponse {
  status: number;
  contentType: string | undefined;
  body: unknown;
  headers: Record<string, string>;
}

interface ChainableResponse {
  status(code: number): ChainableResponse;
  type(value: string): ChainableResponse;
  setHeader(name: string, value: string): void;
  send(body: unknown): ChainableResponse;
}

const httpContext = (request: Partial<Request>): {
  host: ArgumentsHost;
  response: RecordedResponse;
} => {
  const recorded: RecordedResponse = {
    status: 0,
    contentType: undefined,
    body: undefined,
    headers: {},
  };
  const chainable: ChainableResponse = {
    status(code: number) {
      recorded.status = code;
      return this;
    },
    type(value: string) {
      recorded.contentType = value;
      return this;
    },
    setHeader(name: string, value: string) {
      recorded.headers[name.toLowerCase()] = value;
    },
    send(body: unknown) {
      recorded.body = body;
      return this;
    },
  };
  const host = {
    switchToHttp: (): Record<string, () => unknown> => ({
      getRequest: () => request as Request,
      getResponse: () => chainable as unknown as Response,
    }),
  } as unknown as ArgumentsHost;
  return { host, response: recorded };
};

const requestWith = (init: {
  method?: string;
  url?: string;
  traceId?: string;
}): Partial<Request> => {
  const headers: Record<string, string> = {};
  if (init.traceId !== undefined) headers['x-trace-id'] = init.traceId;
  return {
    method: init.method ?? 'GET',
    originalUrl: init.url ?? '/api/v1/perfil',
    url: init.url ?? '/api/v1/perfil',
    header: (name: string) => headers[name.toLowerCase()],
  } as unknown as Partial<Request>;
};

describe('ProblemDetailsFilter (GW-011)', () => {
  const filter = new ProblemDetailsFilter();

  it('responde con application/problem+json', () => {
    const { host, response } = httpContext(requestWith({}));

    filter.catch(new NotFoundException(), host);

    expect(response.contentType).toBe('application/problem+json');
  });

  it('usa el status del problema mapeado', () => {
    const { host, response } = httpContext(requestWith({}));

    filter.catch(new NotFoundException(), host);

    expect(response.status).toBe(404);
  });

  it('emite el cuerpo canonico de Problem Details', () => {
    const { host, response } = httpContext(requestWith({ traceId: 'trace-abcdefgh' }));

    filter.catch(new BadRequestException({ code: 'VALIDATION_FAILED' }), host);

    expect(Object.keys(response.body as object).sort()).toEqual([
      'code',
      'detail',
      'instance',
      'status',
      'title',
      'traceId',
      'type',
    ]);
  });

  it('reutiliza el traceId entrante cuando es valido', () => {
    const { host, response } = httpContext(requestWith({ traceId: 'trace-abcdefgh' }));

    filter.catch(new NotFoundException(), host);

    expect((response.body as { traceId: string }).traceId).toBe('trace-abcdefgh');
  });

  it('sustituye por uno generado un traceId entrante con formato hostil', () => {
    const { host, response } = httpContext(
      requestWith({ traceId: 'a'.repeat(500) + ' <script>' }),
    );

    filter.catch(new NotFoundException(), host);

    const traceId = (response.body as { traceId: string }).traceId;
    expect(traceId).not.toContain('script');
    expect(traceId).toMatch(/^[A-Za-z0-9_-]{8,128}$/);
  });

  it('genera un traceId cuando la peticion no lo trae', () => {
    const { host, response } = httpContext(requestWith({}));

    filter.catch(new NotFoundException(), host);

    expect((response.body as { traceId: string }).traceId).toMatch(
      /^[A-Za-z0-9_-]{8,128}$/,
    );
  });

  it('usa la ruta sin query string como instance', () => {
    const { host, response } = httpContext(
      requestWith({ url: '/api/v1/usuarios?correo=ana%40stayhub.example&rol=ADMIN' }),
    );

    filter.catch(new NotFoundException(), host);

    expect((response.body as { instance: string }).instance).toBe('/api/v1/usuarios');
  });

  it('cae en 500 para una excepcion que no es HttpException', () => {
    const { host, response } = httpContext(requestWith({}));

    filter.catch(new Error('boom hunter2'), host);

    expect(response.status).toBe(500);
    expect(JSON.stringify(response.body)).not.toContain('hunter2');
  });

  it('no filtra la query string con correo en el cuerpo de error', () => {
    const { host, response } = httpContext(
      requestWith({ url: '/api/v1/usuarios?correo=ana%40stayhub.example' }),
    );

    filter.catch(new NotFoundException(), host);

    expect(JSON.stringify(response.body)).not.toContain('ana@stayhub.example');
  });

  it('tolera una peticion sin originalUrl ni url', () => {
    const { host, response } = httpContext({ header: () => undefined } as Partial<Request>);

    filter.catch(new NotFoundException(), host);

    expect((response.body as { instance: string }).instance).toBe('/');
  });

  it('no escribe cabeceras extrañas en la respuesta de error', () => {
    const { host, response } = httpContext(requestWith({}));

    filter.catch(new NotFoundException(), host);

    expect(response.headers).toEqual({});
  });
});
