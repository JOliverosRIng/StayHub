import { generateKeyPairSync } from 'node:crypto';

import { provisionAuthUsersHarness, type AuthUsersHarness } from '../helpers/auth-users-harness';
import {
  createUsersIdentity,
  register,
  registerBody,
  resolveIdentity,
  schemaViolations,
  usersResponseSchema,
  stableProblem,
  syntheticEmail,
} from '../helpers/auth-users-flows';

// Contrato de consumidor Auth -> Users (lookup de login) contra Users real (task-06).
// INT-08: lookup devuelve exactamente userId/role/status ACTIVE; ausente y no
// activo son indistinguibles. INT-16 sobre la ruta de lookup.

const LOOKUP_PATH = '/internal/v1/login-identities/resolve';

describe('Users login-identity consumer contract (task-06)', () => {
  let harness: AuthUsersHarness | undefined;
  const h = (): AuthUsersHarness => harness as AuthUsersHarness;

  beforeAll(async () => {
    harness = await provisionAuthUsersHarness();
  }, 900_000);

  afterAll(async () => {
    await harness?.dispose();
  }, 120_000);

  describe('INT-08 real lookup', () => {
    it('returns exactly userId, role and status ACTIVE for a user registered through Auth', async () => {
      const body = registerBody('lookup-owner', 'OWNER');
      const registered = await register(h(), body);
      expect(registered.status).toBe(201);

      const response = await resolveIdentity(h(), body.email.toUpperCase());
      expect(response.status).toBe(200);
      expect(schemaViolations(response.body, usersResponseSchema(LOOKUP_PATH, 'post', 200))).toEqual([]);
      expect(response.body).toStrictEqual({ userId: registered.body?.id, role: 'OWNER', status: 'ACTIVE' });
      expect(Object.keys(response.body ?? {}).sort()).toEqual(['role', 'status', 'userId']);
    });

    it('absent, PENDING and CANCELLED identities are indistinguishable 404s', async () => {
      const pending = await createUsersIdentity(h(), 'PENDING');
      const cancelled = await createUsersIdentity(h(), 'CANCELLED');
      const responses = await Promise.all([
        resolveIdentity(h(), syntheticEmail('absent')),
        resolveIdentity(h(), pending.email),
        resolveIdentity(h(), cancelled.email),
      ]);

      for (const response of responses) expect(response.status).toBe(404);
      const [absent, ...inactive] = responses.map((response) => stableProblem(response.body));
      for (const problem of inactive) expect(problem).toStrictEqual(absent);
      for (const response of responses) {
        expect(response.text).not.toContain(pending.userId);
        expect(response.text).not.toContain(cancelled.userId);
      }
    });
  });

  describe('INT-16 service JWT trust on lookup', () => {
    it('rejects a token with only the registration scope with 403', async () => {
      const token = await h().usersServiceToken({ scope: h().registrationScope });
      const response = await h().usersRequest(LOOKUP_PATH, { token, body: { email: syntheticEmail('scope') } });
      expect(response.status).toBe(403);
    });

    it('rejects a token signed with an untrusted key with 401', async () => {
      const privateKey = generateKeyPairSync('rsa', { modulusLength: 2048 })
        .privateKey.export({ type: 'pkcs8', format: 'pem' })
        .toString();
      const token = await h().usersServiceToken({ privateKey });
      const response = await h().usersRequest(LOOKUP_PATH, { token, body: { email: syntheticEmail('key') } });
      expect(response.status).toBe(401);
    });

    it('rejects a user access JWT used as service token', async () => {
      const body = registerBody('lookup-user-jwt');
      expect((await register(h(), body)).status).toBe(201);
      const login = await h().authRequest<{ accessToken: string }>('/internal/v1/login', {
        token: await h().serviceToken(),
        body: { email: body.email, password: body.password },
      });
      expect(login.status).toBe(200);
      const response = await h().usersRequest(LOOKUP_PATH, {
        token: login.body?.accessToken ?? '',
        body: { email: body.email },
      });
      expect(response.status).toBe(401);
    });
  });
});
