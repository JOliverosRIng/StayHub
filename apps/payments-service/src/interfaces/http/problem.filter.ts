import { randomBytes } from 'node:crypto';
import { ArgumentsHost, Catch, type ExceptionFilter } from '@nestjs/common';
import type { Request, Response } from 'express';
import { mapPaymentProblem } from './problem.mapper';

interface PaymentRequest extends Request {
  traceId?: string;
}

function getTraceId(request: PaymentRequest): string {
  if (typeof request.traceId === 'string' && /^[0-9a-f]{32}$/.test(request.traceId) && !/^0+$/.test(request.traceId)) {
    return request.traceId;
  }
  request.traceId = randomBytes(16).toString('hex');
  return request.traceId;
}

@Catch()
export class ProblemFilter implements ExceptionFilter {
  catch(error: unknown, host: ArgumentsHost): void {
    const http = host.switchToHttp();
    const request = http.getRequest<PaymentRequest>();
    const response = http.getResponse<Response>();
    const problem = mapPaymentProblem(error, getTraceId(request));
    response.setHeader('x-trace-id', problem.traceId);
    response.setHeader('Cache-Control', 'no-store');
    response.status(problem.status).type('application/problem+json').json(problem);
  }
}
