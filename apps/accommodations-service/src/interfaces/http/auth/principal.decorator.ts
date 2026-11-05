import { createParamDecorator, type ExecutionContext } from '@nestjs/common';
import type { Principal } from '@accommodations/domain/properties/property.types';
import type { AuthenticatedRequest } from './jwt.strategy';

export const CurrentPrincipal = createParamDecorator((_data: unknown, context: ExecutionContext): Principal | undefined =>
  context.switchToHttp().getRequest<AuthenticatedRequest>().principal);
