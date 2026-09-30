import { Inject, Injectable } from '@nestjs/common';
import type { CookieOptions, Response } from 'express';

import { GATEWAY_CONFIG, type GatewayConfig } from '@gateway/infrastructure/config/gateway-config';

/**
 * GW-037 — Servicio de la cookie de refresh (FR-010, FR-024).
 *
 * Emite el refresh token como cookie `Secure`, `HttpOnly`, `SameSite=Strict` con path restringido
 * únicamente a la ruta de refresh, de modo que no viaja con el resto del sitio. Ofrece `set`,
 * `rotate` (nuevo valor que reemplaza al anterior en cada renovación) y `clear` (logout, rotación
 * o reutilización). El token viaja SOLO en la cookie: este servicio nunca lo escribe en el cuerpo
 * de la respuesta ni lo registra, respetando la redacción de GW-012 (que además redacta `cookie`,
 * `token` y `refresh` si algún log los tocara).
 */

export const REFRESH_COOKIE_NAME = 'stayhub_refresh';

const SESSION_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000; // Límite absoluto de sesión (7 días).

@Injectable()
export class RefreshCookieService {
  private readonly path: string;

  public constructor(@Inject(GATEWAY_CONFIG) config: GatewayConfig) {
    this.path = `${config.apiPrefix}/auth/refresh`;
  }

  /** Emite la cookie de refresh restringida a la ruta de refresh. */
  public set(response: Response, token: string): void {
    response.cookie(REFRESH_COOKIE_NAME, token, this.attributes(SESSION_MAX_AGE_MS));
  }

  /** Rota el refresh: fija el valor nuevo bajo la misma cookie; el anterior deja de enviarse. */
  public rotate(response: Response, token: string): void {
    this.set(response, token);
  }

  /** Limpia/invalida la cookie con el mismo path restringido (logout, rotación, reutilización). */
  public clear(response: Response): void {
    response.clearCookie(REFRESH_COOKIE_NAME, this.attributes());
  }

  private attributes(maxAge?: number): CookieOptions {
    return {
      httpOnly: true,
      secure: true,
      sameSite: 'strict',
      path: this.path,
      ...(maxAge === undefined ? {} : { maxAge }),
    };
  }
}
