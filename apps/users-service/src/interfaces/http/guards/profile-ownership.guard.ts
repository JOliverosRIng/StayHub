import { Injectable, UnauthorizedException, type CanActivate, type ExecutionContext } from '@nestjs/common';
import type { Request } from 'express';
import { assertOwner } from '@users/domain/profiles/ownership.policy';
import type { Principal } from '../auth/jwt.strategy';
@Injectable()
export class ProfileOwnershipGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<Request & { user?: Principal }>();
    if (!request.user) throw new UnauthorizedException();
    assertOwner(request.user.sub, request.params.userId ?? '');
    return true;
  }
}
