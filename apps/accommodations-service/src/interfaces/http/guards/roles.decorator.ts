import { SetMetadata } from '@nestjs/common';
import type { Role } from '@accommodations/domain/properties/property.types';
export const ROLES_METADATA = 'accommodations:roles';
export const Roles = (...roles: Role[]): ReturnType<typeof SetMetadata> => SetMetadata(ROLES_METADATA, roles);
