import { randomUUID } from 'node:crypto';
import { pendingFixture } from './users.fixture';

/** Synthetic provider inputs; consumers supply their own real authentication. */
export function consumerHandoffFixture(): {
  registration: ReturnType<typeof pendingFixture>;
  changedEmail: string;
  paths: { registration: string; activate: string; cancel: string; lookup: string; profile: string };
} {
  const registration = pendingFixture();
  return {
    registration,
    changedEmail: `${randomUUID()}@example.test`,
    paths: {
      registration: '/internal/v1/registrations',
      activate: `/internal/v1/registrations/${registration.registrationId}/activate`,
      cancel: `/internal/v1/registrations/${registration.registrationId}/cancel`,
      lookup: '/internal/v1/login-identities/resolve',
      profile: `/internal/v1/users/${registration.userId}/profile`,
    },
  };
}
