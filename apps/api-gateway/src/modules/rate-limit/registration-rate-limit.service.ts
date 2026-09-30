import { HttpException, HttpStatus, Injectable } from '@nestjs/common';
import type { Request } from 'express';

import {
  RATE_LIMIT_SCOPE,
  RateLimitStore,
} from '@gateway/infrastructure/cache/rate-limit.store';
import { TrustedOriginService } from '@gateway/infrastructure/security/trusted-origin.service';

/**
 * GW-027 — Límite de registro por origen confiable con fallo cerrado (Plan §3, FR-001–FR-006).
 *
 * Ventana rodante de 10 solicitudes por origen cada 10 minutos: la solicitud 11 devuelve 429 con
 * `Retry-After` exacto y la ventana se recupera automáticamente al vencer. El origen se determina
 * con GW-013 (`TrustedOriginService`) y el conteo atómico vive en el Redis de borde a través de
 * GW-014 (`RateLimitStore`, scope `register`). Si el Redis no está disponible, `RateLimitStore`
 * lanza `GatewayDependencyError`, que aquí se propaga sin capturar: el borde falla cerrado (503)
 * en lugar de conceder tráfico ilimitado. No se duplica lógica de Redis ni de resolución de origen.
 */

export const REGISTRATION_RATE_LIMITED = 'REGISTRATION_RATE_LIMITED';

@Injectable()
export class RegistrationRateLimitService {
  public constructor(
    private readonly trustedOrigin: TrustedOriginService,
    private readonly store: RateLimitStore,
  ) {}

  public async enforce(request: Request): Promise<void> {
    const origin = this.trustedOrigin.resolve(
      request.socket.remoteAddress,
      request.headers['x-forwarded-for'],
    );

    const decision = await this.store.consume(RATE_LIMIT_SCOPE.REGISTER, origin);
    if (decision.allowed) return;

    throw new HttpException(
      { code: REGISTRATION_RATE_LIMITED, retryAfter: decision.retryAfterSeconds },
      HttpStatus.TOO_MANY_REQUESTS,
    );
  }
}
