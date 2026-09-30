import type { Request } from 'express';

import { extractBearerToken } from '@gateway/modules/auth/jwt.strategy';
import type { ProfileContext } from '@gateway/infrastructure/http/users-profile.client';
import { traceIdFromRequest } from '@gateway/interfaces/http/trace-id';

/**
 * GW-048 — Contexto de las rutas de perfil hacia Users.
 *
 * `userId` viene del path; se lee desde la petición (no con `@Param`, que dispararía el
 * ValidationPipe global sobre un valor no-objeto). El contexto reenvía SOLO el bearer ya validado
 * por el guard de GW-040 y el `traceId`; ninguna cabecera de identidad del cliente (GW-017 ya las
 * eliminó y el cliente Users de GW-046 no reenvía cabeceras del llamador).
 */

export function userIdOf(request: Request): string {
  return request.params['userId'] ?? '';
}

export function contextOf(request: Request): ProfileContext {
  return {
    traceId: traceIdFromRequest(request),
    bearer: extractBearerToken(request) ?? '',
  };
}
