import { HttpException } from '@nestjs/common';

import type { ServiceResult } from '@gateway/infrastructure/http/service-client.base';
import {
  mapRemoteProblem,
  resolveRemoteOutcome,
  toRemoteHttpException,
} from '@gateway/infrastructure/http/remote-problem.mapper';
import { mapProblem } from '@gateway/interfaces/http/problem.mapper';

const INSTANCE = '/api/v1/auth/register';
const TRACE_ID = 'trace-remote-001';
const PRESERVED = [400, 401, 403, 404, 409, 413, 415, 429] as const;

function remoteResult(
  status: number,
  body?: unknown,
  headers: Record<string, string> = {},
): ServiceResult {
  const bytes =
    body === undefined
      ? new Uint8Array()
      : new TextEncoder().encode(typeof body === 'string' ? body : JSON.stringify(body));
  return { status, headers, body: bytes };
}

describe('remote-problem.mapper (GW-019)', () => {
  it('preserva cada estado remoto contractual esperado', () => {
    for (const status of PRESERVED) {
      const problem = mapRemoteProblem(remoteResult(status), INSTANCE, TRACE_ID);
      expect(problem.status).toBe(status);
    }
  });

  it('conserva el code remoto cuando el cuerpo es un Problem Details valido', () => {
    const problem = mapRemoteProblem(
      remoteResult(409, { code: 'EMAIL_ALREADY_REGISTERED' }),
      INSTANCE,
      TRACE_ID,
    );

    expect(problem.status).toBe(409);
    expect(problem.code).toBe('EMAIL_ALREADY_REGISTERED');
    expect(problem.type.endsWith('email-already-registered')).toBe(true);
  });

  it('usa un code por defecto HTTP_<status> cuando el remoto no aporta uno', () => {
    const problem = mapRemoteProblem(remoteResult(404), INSTANCE, TRACE_ID);

    expect(problem.status).toBe(404);
    expect(problem.code).toBe('HTTP_404');
  });

  it('reescribe instance y traceId con los del Gateway, ignorando los del remoto', () => {
    const problem = mapRemoteProblem(
      remoteResult(400, {
        code: 'VALIDATION_FAILED',
        instance: '/internal/v1/registrations',
        traceId: 'remote-trace-xyz',
        detail: 'detalle interno del remoto',
      }),
      INSTANCE,
      TRACE_ID,
    );

    expect(problem.instance).toBe(INSTANCE);
    expect(problem.traceId).toBe(TRACE_ID);
    expect(problem.detail).not.toBe('detalle interno del remoto');
  });

  it('preserva los field errors depurados a field/code/message', () => {
    const problem = mapRemoteProblem(
      remoteResult(400, {
        code: 'VALIDATION_FAILED',
        errors: [
          { field: 'email', code: 'INVALID', message: 'correo invalido', internal: 'leak' },
          { nope: true },
        ],
      }),
      INSTANCE,
      TRACE_ID,
    );

    expect(problem.errors).toEqual([
      { field: 'email', code: 'INVALID', message: 'correo invalido' },
    ]);
    expect(problem.errors?.[0] && 'internal' in problem.errors[0]).toBe(false);
  });

  it('no filtra campos arbitrarios ni sensibles del cuerpo remoto', () => {
    const problem = mapRemoteProblem(
      remoteResult(400, {
        code: 'VALIDATION_FAILED',
        password: 'super-secreto',
        stack: 'Error: en algun lugar interno',
      }),
      INSTANCE,
      TRACE_ID,
    );

    const asRecord = problem as unknown as Record<string, unknown>;
    expect('password' in asRecord).toBe(false);
    expect('stack' in asRecord).toBe(false);
    expect(JSON.stringify(problem)).not.toContain('super-secreto');
  });

  it('normaliza un 503 remoto a DEPENDENCY_UNAVAILABLE sin arrastrar errores', () => {
    const problem = mapRemoteProblem(
      remoteResult(503, { code: 'UPSTREAM_DOWN', errors: [{ field: 'x', code: 'Y' }] }),
      INSTANCE,
      TRACE_ID,
    );

    expect(problem.status).toBe(503);
    expect(problem.code).toBe('DEPENDENCY_UNAVAILABLE');
    expect(problem.errors).toBeUndefined();
  });

  it('convierte estados inesperados del remoto en 503 y no en un exito', () => {
    for (const status of [500, 502, 504, 418, 422]) {
      const problem = mapRemoteProblem(remoteResult(status, { code: 'WHATEVER' }), INSTANCE, TRACE_ID);
      expect(problem.status).toBe(503);
      expect(problem.code).toBe('DEPENDENCY_UNAVAILABLE');
    }
  });

  it('mapea sin fallar aunque el cuerpo remoto no sea JSON o este vacio', () => {
    const notJson = mapRemoteProblem(remoteResult(400, 'esto no es json {'), INSTANCE, TRACE_ID);
    const empty = mapRemoteProblem(remoteResult(409), INSTANCE, TRACE_ID);

    expect(notJson.status).toBe(400);
    expect(notJson.code).toBe('HTTP_400');
    expect(empty.status).toBe(409);
    expect(empty.code).toBe('HTTP_409');
  });

  it('resuelve el outcome minimo (status/code/errors) de forma pura', () => {
    expect(resolveRemoteOutcome(remoteResult(401))).toEqual({ status: 401, code: 'HTTP_401' });
    expect(resolveRemoteOutcome(remoteResult(500))).toEqual({
      status: 503,
      code: 'DEPENDENCY_UNAVAILABLE',
    });
  });

  describe('toRemoteHttpException', () => {
    it('produce una HttpException con el estado preservado y cuerpo minimo', () => {
      const exception = toRemoteHttpException(remoteResult(413, { code: 'PAYLOAD_TOO_LARGE' }));

      expect(exception).toBeInstanceOf(HttpException);
      expect(exception.getStatus()).toBe(413);
      expect(exception.getResponse()).toEqual({ code: 'PAYLOAD_TOO_LARGE' });
    });

    it('fluye por mapProblem de GW-011 y coincide con el mapeo directo', () => {
      const result = remoteResult(400, {
        code: 'VALIDATION_FAILED',
        errors: [{ field: 'email', code: 'INVALID' }],
      });

      const viaFilter = mapProblem(toRemoteHttpException(result), INSTANCE, TRACE_ID);
      const direct = mapRemoteProblem(result, INSTANCE, TRACE_ID);

      expect(viaFilter).toEqual(direct);
    });
  });
});
