import { randomUUID } from 'node:crypto';

import type { NewPendingUser, PublicRole } from '@users/application/ports/user.repository';

export interface PendingUserOverrides {
  readonly id?: string;
  readonly registrationId?: string;
  readonly name?: string;
  readonly email?: string;
  readonly role?: PublicRole;
}

/** Synthetic data only: never real people, emails or credentials. */
export function aPendingUser(overrides: PendingUserOverrides = {}): NewPendingUser {
  const id = overrides.id ?? randomUUID();
  const email = overrides.email ?? `user-${id}@example.test`;
  return {
    id,
    registrationId: overrides.registrationId ?? randomUUID(),
    name: overrides.name ?? `Synthetic User ${id.slice(0, 8)}`,
    email: email.trim(),
    emailNormalized: email.trim().toLowerCase(),
    role: overrides.role ?? 'GUEST',
  };
}
