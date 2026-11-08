import {
  ForbiddenException,
  Inject,
  Injectable,
  SetMetadata,
  UnauthorizedException,
  type CanActivate,
  type ExecutionContext,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import { PAYMENTS_CONFIG, type PaymentsConfig } from '../../../infrastructure/config/payments-config';
import { verifyServiceJwt } from '../../../infrastructure/security/jwt.verifier';
import { bearer } from '../auth/bearer';
import { verifyPaymentUserPrincipal } from '../auth/jwt.strategy';

type ServiceOperation = 'charge' | 'refund' | 'read';
const SERVICE_TOKEN_MAX_AGE_SECONDS = 300;

export interface ServicePrincipalRequest extends Request {
  paymentsServicePrincipal?: { readonly subject: string };
}

export const ServiceScope = (scope: ServiceOperation): ReturnType<typeof SetMetadata> =>
  SetMetadata('payments:service-scope', scope);

@Injectable()
export class ServiceAuthGuard implements CanActivate {
  constructor(
    @Inject(PAYMENTS_CONFIG) private readonly config: PaymentsConfig,
    private readonly reflector: Reflector,
  ) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<ServicePrincipalRequest>();
    const token = bearer(request);
    let payload: ReturnType<typeof verifyServiceJwt>;
    try {
      payload = verifyServiceJwt(token, this.config.serviceJwt, SERVICE_TOKEN_MAX_AGE_SECONDS);
    } catch {
      if (this.config.userJwt) {
        try {
          verifyPaymentUserPrincipal(token, this.config.userJwt);
          throw new ForbiddenException();
        } catch (error) {
          if (error instanceof ForbiddenException) throw error;
        }
      }
      throw new UnauthorizedException();
    }
    if (typeof payload.sub !== 'string' || payload.sub.trim().length === 0) throw new ForbiddenException();
    const operation = this.reflector.getAllAndOverride<ServiceOperation>('payments:service-scope', [
      context.getHandler(),
      context.getClass(),
    ]);
    const expected = operation === 'charge'
      ? this.config.chargeScope
      : operation === 'refund'
        ? this.config.refundScope
        : operation === 'read'
          ? this.config.readScope
          : undefined;
    if (!expected || payload.scope !== expected) throw new ForbiddenException();
    request.paymentsServicePrincipal = { subject: payload.sub };
    return true;
  }
}
