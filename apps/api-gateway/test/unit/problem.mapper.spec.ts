import {
  BadRequestException,
  ConflictException,
  HttpException,
  NotFoundException,
  PayloadTooLargeException,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';

import { GatewayDependencyError } from '@gateway/application/errors/gateway-errors';
import { mapProblem } from '@gateway/interfaces/http/problem.mapper';

const tooManyRequests = (): HttpException => new HttpException('Too many requests', 429);

const INSTANCE = '/api/v1/usuarios';
const TRACE_ID = '6f1d0c2a-1f3b-4a55-9c0e-2b7d5e8a4c11';

describe('mapProblem (GW-011)', () => {
  it('emite siempre los siete campos canonicos y nada mas', () => {
    const problem = mapProblem(new NotFoundException(), INSTANCE, TRACE_ID);

    expect(Object.keys(problem).sort()).toEqual([
      'code',
      'detail',
      'instance',
      'status',
      'title',
      'traceId',
      'type',
    ]);
  });

  it('deriva type como uri-reference en kebab-case a partir del code', () => {
    const problem = mapProblem(
      new BadRequestException({ code: 'VALIDATION_FAILED', errors: [] }),
      INSTANCE,
      TRACE_ID,
    );

    expect(problem.type).toBe('https://stayhub.example/problems/validation-failed');
    expect(problem.code).toBe('VALIDATION_FAILED');
  });

  it('conserva el status del HttpException', () => {
    expect(mapProblem(new UnauthorizedException(), INSTANCE, TRACE_ID).status).toBe(401);
    expect(mapProblem(new ConflictException(), INSTANCE, TRACE_ID).status).toBe(409);
    expect(
      mapProblem(new PayloadTooLargeException(), INSTANCE, TRACE_ID).status,
    ).toBe(413);
    expect(mapProblem(tooManyRequests(), INSTANCE, TRACE_ID).status).toBe(429);
    expect(
      mapProblem(new ServiceUnavailableException(), INSTANCE, TRACE_ID).status,
    ).toBe(503);
  });

  it('deriva un code estable cuando el HttpException no lo declara', () => {
    expect(mapProblem(new NotFoundException(), INSTANCE, TRACE_ID).code).toBe('HTTP_404');
  });

  it('mantiene los errores de campo como FieldError con field y code', () => {
    const problem = mapProblem(
      new BadRequestException({
        code: 'VALIDATION_FAILED',
        errors: [
          { field: 'email', code: 'invalid_email' },
          { field: 'password', code: 'too_short', message: 'Longitud minima de 8 caracteres' },
        ],
      }),
      INSTANCE,
      TRACE_ID,
    );

    expect(problem.errors).toEqual([
      { field: 'email', code: 'invalid_email' },
      { field: 'password', code: 'too_short', message: 'Longitud minima de 8 caracteres' },
    ]);
  });

  it('descarta entradas de error que no cumplen el contrato publico', () => {
    const problem = mapProblem(
      new BadRequestException({
        code: 'VALIDATION_FAILED',
        errors: ['password must be longer', { code: 'sin_campo' }, 42, null],
      }),
      INSTANCE,
      TRACE_ID,
    );

    expect(problem.errors).toEqual([]);
  });

  it('omite errors cuando la respuesta no los trae', () => {
    const problem = mapProblem(new UnauthorizedException(), INSTANCE, TRACE_ID);

    expect(problem.errors).toBeUndefined();
    expect('errors' in problem).toBe(false);
  });

  it('mapea un dependencia caida a 503 con detalle generico', () => {
    const problem = mapProblem(new GatewayDependencyError('gateway-redis'), INSTANCE, TRACE_ID);

    expect(problem.status).toBe(503);
    expect(problem.detail).not.toContain('gateway-redis');
  });

  it('nunca filtra el mensaje interno de un error desconocido (FR-024)', () => {
    const problem = mapProblem(
      new Error('connect ECONNREFUSED 10.0.0.5:6379 password=hunter2'),
      INSTANCE,
      TRACE_ID,
    );

    expect(problem.status).toBe(500);
    expect(problem.code).toBe('INTERNAL_ERROR');
    expect(problem.detail).not.toContain('hunter2');
    expect(problem.detail).not.toContain('10.0.0.5');
    expect(problem.detail).not.toContain('ECONNREFUSED');
  });

  it('nunca filtra el mensaje interno de un HttpException 5xx', () => {
    const problem = mapProblem(
      new ServiceUnavailableException('upstream said hunter2 is the admin token'),
      INSTANCE,
      TRACE_ID,
    );

    expect(problem.detail).not.toContain('hunter2');
  });

  it('usa un detail generico y distinto para 4xx y 5xx', () => {
    const badRequest = mapProblem(new BadRequestException(), INSTANCE, TRACE_ID);
    const failure = mapProblem(new GatewayDependencyError('users'), INSTANCE, TRACE_ID);

    expect(badRequest.detail).toBe('The request is invalid');
    expect(failure.detail).toBe('A required service could not complete the request');
  });

  it('titula el problema a partir del status, no del texto enviado', () => {
    // Mismo formato que el mapper de Auth: el cliente no debe ver titulos distintos
    // para la misma condicion segun haya entrado por el Gateway o por Auth directamente.
    expect(mapProblem(new NotFoundException(), INSTANCE, TRACE_ID).title).toBe('NOT FOUND');
    expect(mapProblem(tooManyRequests(), INSTANCE, TRACE_ID).title).toBe(
      'TOO MANY REQUESTS',
    );
  });

  it('no usa el texto de la excepcion como title', () => {
    const problem = mapProblem(
      new BadRequestException('el usuario ana@stayhub.example ya existe'),
      INSTANCE,
      TRACE_ID,
    );

    expect(problem.title).toBe('BAD REQUEST');
    expect(problem.detail).not.toContain('ana@stayhub.example');
  });

  it('propaga instance y traceId sin transformarlos', () => {
    const problem = mapProblem(new NotFoundException(), INSTANCE, TRACE_ID);

    expect(problem.instance).toBe(INSTANCE);
    expect(problem.traceId).toBe(TRACE_ID);
  });

  it('tolera una excepcion que no es HttpException ni GatewayDependencyError', () => {
    const problem = mapProblem('texto suelto', INSTANCE, TRACE_ID);

    expect(problem.status).toBe(500);
  });

  it('no propaga el status de un HttpException con codigo no numerico', () => {
    const weird = new HttpException({ status: 'cuatrocientos' }, 200);

    expect(mapProblem(weird, INSTANCE, TRACE_ID).status).toBe(200);
  });
});
