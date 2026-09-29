import { CallHandler, ExecutionContext } from '@nestjs/common';
import type { Request } from 'express';
import { lastValueFrom, of } from 'rxjs';

import {
  IdentityHeaderInterceptor,
  STRIPPED_REQUEST_HEADERS,
} from '@gateway/interfaces/http/security/identity-header.interceptor';

const requestWithHeaders = (headers: Record<string, string>): Request =>
  ({ headers }) as unknown as Request;

const contextFor = (request: Request): ExecutionContext =>
  ({
    switchToHttp: (): Record<string, () => unknown> => ({
      getRequest: () => request,
    }),
  }) as unknown as ExecutionContext;

const handler = (): CallHandler => ({ handle: () => of('ok') });

const run = async (headers: Record<string, string>): Promise<Request> => {
  const request = requestWithHeaders(headers);
  await lastValueFrom(
    new IdentityHeaderInterceptor().intercept(contextFor(request), handler()),
  );
  return request;
};

const STRIP_CASES: readonly string[] = [
  'x-user-id',
  'x-user-role',
  'x-user-email',
  'x-session-id',
  'x-authenticated-user',
  'x-forwarded-user',
  'x-forwarded-for',
  'x-forwarded-host',
  'x-forwarded-proto',
  'x-forwarded-port',
  'x-forwarded-prefix',
  'x-real-ip',
  'x-client-ip',
  'forwarded',
  'x-service-token',
  'x-service-auth',
  'x-service-jwt',
  'x-service-authorization',
  'x-api-key',
  'x-internal-token',
];

const KEEP_CASES: readonly string[] = [
  'authorization',
  'cookie',
  'idempotency-key',
  'content-type',
  'accept',
  'x-trace-id',
  'user-agent',
];

describe('IdentityHeaderInterceptor (GW-017)', () => {
  it.each(STRIP_CASES)('elimina la cabecera %s aportada por el cliente', async (header) => {
    const request = await run({ [header]: 'valor-fabricado' });

    expect(request.headers).not.toHaveProperty(header);
  });

  it.each(KEEP_CASES)('conserva la cabecera legitima %s', async (header) => {
    const request = await run({ [header]: 'valor-real' });

    expect(request.headers[header]).toBe('valor-real');
  });

  it('elimina las cabeceras aunque lleguen con mayusculas', async () => {
    const request = await run({ 'X-User-Id': '1', 'X-Forwarded-For': '9.9.9.9' });

    expect(Object.keys(request.headers)).toEqual([]);
  });

  it('elimina un intento de suplantar identidad junto a un token valido', async () => {
    const request = await run({
      authorization: 'Bearer eyJhbGciOiJSUzI1NiJ9.eyJzdWIiOiJhIn0.sig',
      'x-user-id': 'victima',
      'x-user-role': 'ADMIN',
    });

    expect(request.headers['x-user-id']).toBeUndefined();
    expect(request.headers['x-user-role']).toBeUndefined();
    expect(request.headers['authorization']).toBe(
      'Bearer eyJhbGciOiJSUzI1NiJ9.eyJzdWIiOiJhIn0.sig',
    );
  });

  it('elimina todas las cabeceras de forwarding de una vez', async () => {
    const request = await run({
      'x-forwarded-for': '203.0.113.9, 10.0.0.1',
      'x-forwarded-proto': 'http',
      'x-real-ip': '203.0.113.9',
      forwarded: 'for=203.0.113.9',
    });

    expect(Object.keys(request.headers)).toEqual([]);
  });

  it('no inventa cabeceras que el cliente no envio', async () => {
    const request = await run({ accept: 'application/json' });

    expect(Object.keys(request.headers)).toEqual(['accept']);
  });

  it('deja intacta una peticion sin cabeceras de riesgo', async () => {
    const request = await run({ 'content-type': 'application/json' });

    expect(request.headers).toEqual({ 'content-type': 'application/json' });
  });

  it('devuelve la respuesta del handler sin alterarla', async () => {
    const request = requestWithHeaders({ 'x-user-id': '1' });

    const result = await lastValueFrom(
      new IdentityHeaderInterceptor().intercept(contextFor(request), handler()),
    );

    expect(result).toBe('ok');
  });

  it('expone la lista de cabeceras eliminadas para poder verificarla', () => {
    expect(STRIPPED_REQUEST_HEADERS).toEqual(expect.arrayContaining(STRIP_CASES));
    for (const header of KEEP_CASES) {
      expect(STRIPPED_REQUEST_HEADERS).not.toContain(header);
    }
  });
});
