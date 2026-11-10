import { ProblemFilter } from '../../src/interfaces/http/problem.filter';
import { traceMiddleware } from '../../src/interfaces/http/trace.middleware';
import type { ArgumentsHost } from '@nestjs/common';
import type { Request, Response } from 'express';

describe('HTTP adapters (NTF-003)', () => {
  it('propagates a safe caller trace id and generates one when malformed', () => {
    const request = { header: () => 'trace-1', traceId: undefined as string | undefined } as unknown as Request & { traceId?: string };
    const setHeader = jest.fn();
    const response = { setHeader } as unknown as Response;
    traceMiddleware(request, response, jest.fn());
    expect(request.traceId).toBe('trace-1');
    expect(setHeader.mock.calls[0]).toEqual(['x-trace-id', 'trace-1']);
  });

  it('maps unknown failures to sanitized Problem Details', () => {
    const bodies: Record<string, unknown>[] = [];
    const json = (body: Record<string, unknown>): void => { bodies.push(body); };
    const statusCodes: number[] = [];
    const response = {
      status: (code: number): Response => { statusCodes.push(code); return response; },
      type: (): Response => response,
      json,
    } as unknown as Response;
    const host = {
      switchToHttp: (): { getRequest: () => { originalUrl: string; traceId: string }; getResponse: () => Response } => ({
        getRequest: (): { originalUrl: string; traceId: string } => ({ originalUrl: '/notifications/send', traceId: 't1' }),
        getResponse: (): Response => response,
      }),
    } as unknown as ArgumentsHost;
    new ProblemFilter().catch(new Error('password=secret'), host);
    expect(statusCodes[0]).toBe(500);
    expect(bodies[0]).toMatchObject({ code: 'INTERNAL_ERROR', traceId: 't1', detail: 'The request could not be completed.' });
    expect(JSON.stringify(bodies[0])).not.toContain('secret');
  });
});
