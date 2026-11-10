import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import type { Request } from 'express';
import type { AuthenticatedPrincipal } from '../../../infrastructure/security/jwt.verifier';

export const CurrentPrincipal = createParamDecorator((_data: unknown, context: ExecutionContext): AuthenticatedPrincipal => {
  return context.switchToHttp().getRequest<Request & { user: AuthenticatedPrincipal }>().user;
});
