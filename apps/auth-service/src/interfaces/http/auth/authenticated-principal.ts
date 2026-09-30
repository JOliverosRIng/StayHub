import type { UserRole } from '@auth/application/ports/users-service.port';

/**
 * Principal built only from a cryptographically verified access JWT whose session was validated against
 * the authoritative PostgreSQL state. Never assembled from client headers or body fields.
 */
export interface AuthenticatedPrincipal {
  readonly userId: string;
  readonly sessionId: string;
  readonly role: UserRole;
  readonly exp: number;
}
