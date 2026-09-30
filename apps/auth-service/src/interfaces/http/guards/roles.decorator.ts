import { SetMetadata } from '@nestjs/common';

import type { UserRole } from '@auth/application/ports/users-service.port';

export const ROLES_KEY = 'auth:roles';

export function Roles(...roles: UserRole[]): MethodDecorator & ClassDecorator {
  return SetMetadata(ROLES_KEY, roles);
}
