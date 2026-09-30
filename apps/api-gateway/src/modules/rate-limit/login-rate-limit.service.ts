import { Injectable } from '@nestjs/common';

import {
  RATE_LIMIT_SCOPE,
  RateLimitStore,
} from '@gateway/infrastructure/cache/rate-limit.store';
import { TrustedOriginService } from '@gateway/infrastructure/security/trusted-origin.service';

import { EdgeRateLimitService } from './edge-rate-limit.service';

/**
 * GW-035 — Límite de login por origen confiable con fallo cerrado (Plan §3, FR-007–FR-008).
 *
 * Ventana rodante de 30 intentos por origen cada 5 minutos: el intento 31 devuelve 429 con
 * `Retry-After` exacto y la ventana se recupera automáticamente al vencer. Reutiliza la lógica
 * común de {@link EdgeRateLimitService} (origen GW-013 + conteo atómico GW-014 en el Redis de
 * borde, scope `login` con namespace propio) y falla cerrado (503) si el Redis no responde.
 */

export const LOGIN_RATE_LIMITED = 'LOGIN_RATE_LIMITED';

@Injectable()
export class LoginRateLimitService extends EdgeRateLimitService {
  public constructor(trustedOrigin: TrustedOriginService, store: RateLimitStore) {
    super(trustedOrigin, store, RATE_LIMIT_SCOPE.LOGIN, LOGIN_RATE_LIMITED);
  }
}
