import { randomUUID } from 'node:crypto';

export interface AuthFixture {
  readonly registrationId: string;
  readonly userId: string;
  readonly sessionId: string;
  readonly email: string;
  readonly password: string;
}

export function authFixture(overrides: Partial<AuthFixture> = {}): AuthFixture {
  const suffix = randomUUID();
  return {
    registrationId: randomUUID(),
    userId: randomUUID(),
    sessionId: randomUUID(),
    email: `person-${suffix}@example.test`,
    password: 'Correct-Horse-Battery-Staple-42',
    ...overrides,
  };
}

