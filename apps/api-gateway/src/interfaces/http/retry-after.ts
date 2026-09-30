import { HttpException } from '@nestjs/common';
import type { Response } from 'express';

const TOO_MANY_REQUESTS_STATUS = 429;

/**
 * Fija la cabecera `Retry-After` en la respuesta cuando el error es un 429 que expone
 * `retryAfter` (segundos), tal como lo producen los límites de borde (GW-027/GW-035). Compartido
 * por las rutas públicas de registro y login para no duplicar la lógica.
 */
export function applyRetryAfter(error: unknown, response: Response): void {
  if (!(error instanceof HttpException) || error.getStatus() !== TOO_MANY_REQUESTS_STATUS) {
    return;
  }
  const body = error.getResponse();
  const retryAfter =
    typeof body === 'object' && body !== null
      ? (body as { retryAfter?: number }).retryAfter
      : undefined;
  if (typeof retryAfter === 'number') {
    response.setHeader('Retry-After', String(retryAfter));
  }
}
