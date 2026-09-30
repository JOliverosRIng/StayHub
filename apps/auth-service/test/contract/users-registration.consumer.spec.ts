import { generateKeyPairSync, randomUUID } from 'node:crypto';

import { provisionAuthUsersHarness, type AuthUsersHarness } from '../helpers/auth-users-harness';
import {
  createUsersIdentity,
  getRegistration,
  register,
  registerBody,
  schemaViolations,
  usersResponseSchema,
  type UserSummaryResponse,
} from '../helpers/auth-users-flows';

// Contrato de consumidor Auth -> Users (registro) contra Users real (task-06).
// Comprueba que las respuestas reales de Users cumplen el OpenAPI interno que
// consume Auth, y la confianza del JWT de servicio (INT-16).

const REGISTRATION_PATH = '/internal/v1/registrations';
const REGISTRATION_ITEM_PATH = '/internal/v1/registrations/{registrationId}';

function otherPrivateKey(): string {
  return generateKeyPairSync('rsa', { modulusLength: 2048 })
    .privateKey.export({ type: 'pkcs8', format: 'pem' })
    .toString();
}

describe('Users registration consumer contract (task-06)', () => {
  let harness: AuthUsersHarness | undefined;
  const h = (): AuthUsersHarness => harness as AuthUsersHarness;

  beforeAll(async () => {
    harness = await provisionAuthUsersHarness();
  }, 900_000);

  afterAll(async () => {
    await harness?.dispose();
  }, 120_000);

  it('GET registration returns a UserSummary that matches the OpenAPI after an Auth registration', async () => {
    const key = randomUUID();
    const body = registerBody('contract-get');
    const registered = await register(h(), body, key);
    expect(registered.status).toBe(201);

    const summary = await getRegistration(h(), key);
    expect(summary.status).toBe(200);
    expect(schemaViolations(summary.body, usersResponseSchema(REGISTRATION_ITEM_PATH, 'get', 200))).toEqual([]);
    expect(summary.body).toEqual<UserSummaryResponse>({
      id: registered.body?.id ?? '',
      name: body.name,
      email: body.email,
      role: 'GUEST',
      status: 'ACTIVE',
    });
  });

  it('GET registration of an unknown registrationId returns 404', async () => {
    const response = await getRegistration(h(), randomUUID());
    expect(response.status).toBe(404);
  });

  it('create, activate and cancel responses keep the contract Auth parses', async () => {
    const token = await h().usersServiceToken({ scope: h().registrationScope });
    const registrationId = randomUUID();
    const userId = randomUUID();
    const created = await h().usersRequest<UserSummaryResponse>(REGISTRATION_PATH, {
      token,
      body: { registrationId, userId, name: 'Contract Pending', email: `c-${registrationId}@example.test`, role: 'OWNER' },
    });
    expect(created.status).toBe(201);
    expect(schemaViolations(created.body, usersResponseSchema(REGISTRATION_PATH, 'post', 201))).toEqual([]);
    expect(created.body).toMatchObject({ id: userId, role: 'OWNER', status: 'PENDING' });

    const cancelled = await h().usersRequest(`${REGISTRATION_PATH}/${registrationId}/cancel`, {
      token,
      method: 'POST',
    });
    expect(cancelled.status).toBe(204);
    expect((await getRegistration(h(), registrationId)).body?.status).toBe('CANCELLED');

    const other = await createUsersIdentity(h(), 'PENDING');
    const activated = await h().usersRequest<UserSummaryResponse>(
      `${REGISTRATION_PATH}/${other.registrationId}/activate`,
      { token, method: 'POST' },
    );
    expect(activated.status).toBe(200);
    expect(schemaViolations(activated.body, usersResponseSchema(`${REGISTRATION_ITEM_PATH}/activate`, 'post', 200))).toEqual([]);
    expect(activated.body?.status).toBe('ACTIVE');
  });

  describe('INT-16 service JWT trust on registration routes', () => {
    it('rejects a correctly signed token without the registration scope with 403', async () => {
      const token = await h().usersServiceToken({ scope: h().lookupScope });
      const registrationId = randomUUID();
      const response = await h().usersRequest(REGISTRATION_PATH, {
        token,
        body: { registrationId, userId: randomUUID(), name: 'No Scope', email: `ns-${registrationId}@example.test`, role: 'GUEST' },
      });
      expect(response.status).toBe(403);
      expect((await getRegistration(h(), registrationId)).status).toBe(404);

      const read = await h().usersRequest(`${REGISTRATION_PATH}/${randomUUID()}`, { token });
      expect(read.status).toBe(403);
    });

    it('rejects a token signed with an untrusted key (same kid) with 401', async () => {
      const token = await h().usersServiceToken({ privateKey: otherPrivateKey() });
      const registrationId = randomUUID();
      const response = await h().usersRequest(REGISTRATION_PATH, {
        token,
        body: { registrationId, userId: randomUUID(), name: 'Bad Key', email: `bk-${registrationId}@example.test`, role: 'GUEST' },
      });
      expect(response.status).toBe(401);
      expect((await getRegistration(h(), registrationId)).status).toBe(404);
    });

    it('rejects an unknown kid and a missing token with 401', async () => {
      const unknownKid = await h().usersServiceToken({ kid: 'unknown-kid' });
      expect((await h().usersRequest(`${REGISTRATION_PATH}/${randomUUID()}`, { token: unknownKid })).status).toBe(401);
      expect((await h().usersRequest(`${REGISTRATION_PATH}/${randomUUID()}`)).status).toBe(401);
    });
  });
});
