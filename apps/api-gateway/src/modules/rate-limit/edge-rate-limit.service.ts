import { HttpException, HttpStatus } from '@nestjs/common';
import type { Request } from 'express';

import type { RateLimitScope, RateLimitStore } from '@gateway/infrastructure/cache/rate-limit.store';
import type { TrustedOriginService } from '@gateway/infrastructure/security/trusted-origin.service';

/**
 * Lógica común de los límites de borde por origen confiable (GW-027 registro, GW-035 login).
 *
 * Determina el origen con GW-013 (`TrustedOriginService`) y consume la ventana rodante atómica
 * del Redis de borde con GW-014 (`RateLimitStore`) bajo el scope indicado. Al exceder el límite
 * lanza 429 con `Retry-After` exacto; si `RateLimitStore` no puede operar (Redis caído) lanza
 * `GatewayDependencyError`, que se propaga sin capturar: el borde falla cerrado (503) en lugar de
 * conceder tráfico. Cada subclase aporta únicamente su scope y su código de error; no se duplica
 * la lógica de ventana ni de Redis.
 */
export abstract class EdgeRateLimitService {
  protected constructor(
    private readonly trustedOrigin: TrustedOriginService,
    private readonly store: RateLimitStore,
    private readonly scope: RateLimitScope,
    private readonly code: string,
  ) {}

  public async enforce(request: Request): Promise<void> {
    const origin = this.trustedOrigin.resolve(
      request.socket.remoteAddress,
      request.headers['x-forwarded-for'],
    );

    const decision = await this.store.consume(this.scope, origin);
    if (decision.allowed) return;

    throw new HttpException(
      { code: this.code, retryAfter: decision.retryAfterSeconds },
      HttpStatus.TOO_MANY_REQUESTS,
    );
  }
}
