import { Injectable } from '@nestjs/common';

import {
  RATE_LIMIT_SCOPE,
  RateLimitStore,
} from '@gateway/infrastructure/cache/rate-limit.store';
import { TrustedOriginService } from '@gateway/infrastructure/security/trusted-origin.service';

import { EdgeRateLimitService } from './edge-rate-limit.service';

/**
 * GW-027 — Límite de registro por origen confiable con fallo cerrado (Plan §3, FR-001–FR-006).
 *
 * Ventana rodante de 10 solicitudes por origen cada 10 minutos: la solicitud 11 devuelve 429 con
 * `Retry-After` exacto y la ventana se recupera automáticamente al vencer. Reutiliza la lógica
 * común de {@link EdgeRateLimitService} (origen GW-013 + conteo atómico GW-014, scope `register`)
 * y falla cerrado (503) si el Redis de borde no responde.
 */

export const REGISTRATION_RATE_LIMITED = 'REGISTRATION_RATE_LIMITED';

@Injectable()
export class RegistrationRateLimitService extends EdgeRateLimitService {
  public constructor(trustedOrigin: TrustedOriginService, store: RateLimitStore) {
    super(trustedOrigin, store, RATE_LIMIT_SCOPE.REGISTER, REGISTRATION_RATE_LIMITED);
  }
}
