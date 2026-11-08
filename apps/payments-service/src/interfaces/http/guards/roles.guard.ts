import {
  ForbiddenException,
  Injectable,
  SetMetadata,
  UnauthorizedException,
  type CanActivate,
  type ExecutionContext,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import type { PaymentPrincipal } from '../auth/jwt.strategy';

export type PaymentRole = PaymentPrincipal['role'];
export const Roles = (...roles: PaymentRole[]): ReturnType<typeof SetMetadata> =>
  SetMetadata('payments:roles', roles);

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<Request & { user?: PaymentPrincipal }>();
    const principal = request.user;
    if (!principal) throw new UnauthorizedException();
    const roles = this.reflector.getAllAndOverride<PaymentRole[]>('payments:roles', [
      context.getHandler(),
      context.getClass(),
    ]);
    if (roles && !roles.includes(principal.role)) throw new ForbiddenException();
    return true;
  }
}
