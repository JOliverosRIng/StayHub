import { Controller, Get, HttpCode, HttpStatus, Req, UnauthorizedException } from '@nestjs/common';
import type { Request } from 'express';

import type { UserRole } from '@gateway/application/ports/jwt-verifier.port';
import { ValidateApiDocs } from '@gateway/interfaces/openapi/session.openapi';

import { principalFrom } from './access.guard';
import type { AuthenticatedPrincipal } from './jwt.strategy';

/**
 * GW-041 — Ruta autenticada `GET /api/v1/auth/validate` (FR-009–FR-013, FR-024).
 *
 * Confirma si el bearer presentado sigue siendo una sesión utilizable. No vuelve a verificar el JWT
 * ni a llamar a Auth: el pipeline global de GW-040 ya ejecutó, en orden, verificación RS256
 * (GW-016) e introspección obligatoria de `sub`/`sid` (GW-039) antes de llegar aquí. Esta capa solo
 * traduce el principal validado a la proyección pública; repetir la introspección duplicaría la
 * decisión de acceso y abriría una ventana entre ambas llamadas.
 *
 * Proyección mínima (`Principal` de `contracts/openapi-public.yaml`, `additionalProperties: false`):
 * `userId`, `sessionId` y `role`. No se expone correo, nombre, preferencias, foto, `jti`/`exp` ni
 * ningún token: el access token no se devuelve y el refresh solo vive en su cookie (FR-024). El rol
 * es el de la sesión, ya contrastado con el rol autoritativo de Auth (FR-009).
 *
 * Estados: 200 con la proyección; 401 si falta o no vale el bearer y 503 si Auth está indisponible,
 * ambos decididos por los guards y expresados como Problem Details por GW-011/GW-019; 403 queda
 * reservado para el rol insuficiente (FR-013). La denegación ocurre antes del manejador, así que
 * esta ruta no aplica ningún cambio.
 *
 * No se marca con `@Public()`: es exactamente el caso que la autenticación global debe proteger.
 */

/** Proyección pública de la identidad y su sesión. Superficie mínima, sin datos sensibles. */
export interface PublicPrincipal {
  readonly userId: string;
  readonly sessionId: string;
  readonly role: UserRole;
}

@Controller('auth')
export class ValidateController {
  @Get('validate')
  @HttpCode(HttpStatus.OK)
  @ValidateApiDocs()
  public validate(@Req() request: Request): PublicPrincipal {
    const principal = requirePrincipal(request);
    return {
      userId: principal.userId,
      sessionId: principal.sessionId,
      role: principal.role,
    };
  }
}

/**
 * Invariante del pipeline, no validación nueva: `AccessGuard` (GW-040) se ejecuta antes y adjunta el
 * principal. Si faltara, la petición no acreditó sesión y se responde 401 genérico, nunca 500 con
 * detalle interno.
 */
function requirePrincipal(request: Request): AuthenticatedPrincipal {
  const principal = principalFrom(request);
  if (principal === undefined) {
    throw new UnauthorizedException({ code: 'AUTHENTICATION_REQUIRED' });
  }
  return principal;
}
