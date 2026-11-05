import type { Principal, PropertyStatus } from './property.types';
export function isOwner(property: { ownerId: string }, principal: Principal | undefined): boolean {
  return principal?.role === 'OWNER' && principal.sub === property.ownerId;
}
export function canView(property: { ownerId: string; status: PropertyStatus }, principal: Principal | undefined): boolean {
  return property.status === 'PUBLISHED' || isOwner(property, principal);
}
