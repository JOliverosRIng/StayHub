import { SetMetadata } from '@nestjs/common';
import type { UserRole } from '@users/domain/users/values';
export const Roles = (...roles: UserRole[]): ReturnType<typeof SetMetadata> => SetMetadata('users:roles', roles);
