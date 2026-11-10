import type { ArgumentsHost } from '@nestjs/common';
import type { Request, Response } from 'express';
import { ProblemFilter } from '../../src/interfaces/http/problem.filter';

describe('ProblemFilter', () => {
  it('writes a non-cacheable application/problem+json response with trace id', () => {
    const headers: Record<string, string> = {};
    const statusSpy = jest.fn();
    const typeSpy = jest.fn();
    const jsonSpy = jest.fn();
    const response = {} as Response;
    Object.assign(response, {
      setHeader: (name: string, value: string): Response => { headers[name] = value; return response; },
      status: (code: number): Response => { statusSpy(code); return response; },
      type: (contentType: string): Response => { typeSpy(contentType); return response; },
      json: (body: unknown): Response => { jsonSpy(body); return response; },
    });
    const request = { traceId: 'e'.repeat(32) } as Request & { traceId: string };
    const host = {
      switchToHttp: (): { getResponse: () => Response; getRequest: () => typeof request } => ({
        getResponse: (): Response => response,
        getRequest: (): typeof request => request,
      }),
    } as unknown as ArgumentsHost;

    new ProblemFilter().catch(new Error('hidden'), host);

    expect(headers['x-trace-id']).toBe('e'.repeat(32));
    expect(headers['Cache-Control']).toBe('no-store');
    expect(statusSpy).toHaveBeenCalledWith(500);
    expect(typeSpy).toHaveBeenCalledWith('application/problem+json');
    expect(jsonSpy).toHaveBeenCalledWith(expect.objectContaining({ code: 'INTERNAL_ERROR' }));
  });
});
