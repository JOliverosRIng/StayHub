import {
  ForbiddenException,
  Inject,
  Injectable,
  type CanActivate,
  type ExecutionContext,
} from '@nestjs/common';
import type { Request } from 'express';
import type { PaymentStatusPrincipal } from '../../../application/payments/get-payment-status.use-case';
import { PAYMENTS_CONFIG, type PaymentsConfig } from '../../../infrastructure/config/payments-config';
import { verifyServiceJwt } from '../../../infrastructure/security/jwt.verifier';
import { bearer } from '../auth/bearer';
import { verifyPaymentUserPrincipal } from '../auth/jwt.strategy';

export interface PaymentReadRequest extends Request {
  paymentReadPrincipal?: PaymentStatusPrincipal;
}

@Injectable()
export class PaymentReadAuthGuard implements CanActivate {
  constructor(@Inject(PAYMENTS_CONFIG) private readonly config: PaymentsConfig) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<PaymentReadRequest>();
    const token = bearer(request);
    let serviceClaims: ReturnType<typeof verifyServiceJwt>;
    try {
      serviceClaims = verifyServiceJwt(token, this.config.serviceJwt, 300);
    } catch {
      const user = verifyPaymentUserPrincipal(token, this.config.userJwt);
      request.paymentReadPrincipal = { kind: 'user', ...user };
      return true;
    }

    if (typeof serviceClaims.scope !== 'string' || !serviceClaims.scope.split(' ').includes(this.config.readScope)) {
      throw new ForbiddenException();
    }
    if (typeof serviceClaims.sub !== 'string' || !serviceClaims.sub.trim()) throw new ForbiddenException();
    request.paymentReadPrincipal = { kind: 'service', subject: serviceClaims.sub };
    return true;
  }
}
