import { randomUUID } from 'node:crypto';

import {
  provisionAuthUsersHarness,
  type AuthUsersHarness,
} from '../helpers/auth-users-harness';

// Smoke real Auth<->Users sin Gateway (task-05):
// readiness de ambos servicios reales, un registro a través de Auth y login de
// ese usuario contra Users real. Usa la configuración persistente B1 y recursos
// desechables; no usa CROSS_SERVICE_GATEWAY_URL ni el stub de Users.

const PASSWORD = 'Correct-Horse-Battery-Staple-42';
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

interface RegisterResponse {
  readonly id: string;
  readonly name: string;
  readonly email: string;
  readonly role: string;
}

interface LoginResponse {
  readonly accessToken: string;
  readonly refreshToken: string;
  readonly expiresIn: number;
  readonly principal: {
    readonly userId: string;
    readonly sessionId: string;
    readonly role: string;
  };
}

describe('Auth<->Users smoke without Gateway (task-05)', () => {
  let harness: AuthUsersHarness | undefined;
  let serviceToken: string;

  beforeAll(async () => {
    harness = await provisionAuthUsersHarness();
    serviceToken = await harness.serviceToken();
  }, 900_000);

  afterAll(async () => {
    await harness?.dispose();
  }, 120_000);

  it('reports readiness for both real services', async () => {
    const h = harness as AuthUsersHarness;
    const [auth, users] = await Promise.all([
      h.authRequest('/health/ready'),
      h.usersRequest('/health/ready'),
    ]);

    expect(auth.status).toBe(200);
    expect(users.status).toBe(200);
  });

  it('registers a user through Auth and logs it in against real Users', async () => {
    const h = harness as AuthUsersHarness;
    const email = `smoke-${randomUUID()}@example.test`;

    const register = await h.authRequest<RegisterResponse>('/internal/v1/registrations', {
      token: serviceToken,
      idempotencyKey: randomUUID(),
      traceId: `smoke-register-${randomUUID()}`,
      body: { name: 'Smoke Guest', email, password: PASSWORD, role: 'GUEST' },
    });

    expect(register.status).toBe(201);
    expect(register.body).toMatchObject({ name: 'Smoke Guest', email, role: 'GUEST' });
    expect(register.body?.id).toMatch(UUID_PATTERN);
    expect(JSON.stringify(register.body)).not.toContain(PASSWORD);

    const login = await h.authRequest<LoginResponse>('/internal/v1/login', {
      token: serviceToken,
      traceId: `smoke-login-${randomUUID()}`,
      body: { email, password: PASSWORD },
    });

    expect(login.status).toBe(200);
    expect(typeof login.body?.accessToken).toBe('string');
    expect(login.body?.accessToken.length ?? 0).toBeGreaterThan(0);
    expect(login.body?.principal.userId).toBe(register.body?.id);
    expect(login.body?.principal.userId).toMatch(UUID_PATTERN);
    expect(login.body?.principal.role).toBe('GUEST');
  });
});
