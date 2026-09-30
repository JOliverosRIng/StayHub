import { randomUUID } from 'node:crypto';

import { provisionAuthUsersHarness, type AuthUsersHarness } from '../helpers/auth-users-harness';
import {
  getRegistration,
  login,
  register,
  registerBody,
  UUID_PATTERN,
  type Role,
} from '../helpers/auth-users-flows';

// Registro cross-service Auth -> Users real sin Gateway (task-06): INT-01..05.

function sleep(millis: number): Promise<void> {
  return new Promise((resolvePromise) => setTimeout(resolvePromise, millis));
}

describe('Cross-service registration Auth<->Users (task-06)', () => {
  let harness: AuthUsersHarness | undefined;
  const h = (): AuthUsersHarness => harness as AuthUsersHarness;

  const countUsers = (column: 'registrationId' | 'emailNormalized', value: string): number =>
    Number(h().queryUsersDb(`SELECT count(*) FROM "User" WHERE "${column}" = '${value}'`)[0]);
  const countAuth = (table: 'Registration' | 'Credential', column: string, value: string): number =>
    Number(h().queryAuthDb(`SELECT count(*) FROM "${table}" WHERE "${column}" = '${value}'`)[0]);

  beforeAll(async () => {
    harness = await provisionAuthUsersHarness();
  }, 900_000);

  afterAll(async () => {
    await harness?.dispose();
  }, 120_000);

  describe('INT-01 complete registration through Auth', () => {
    it.each<Role>(['GUEST', 'OWNER'])('registers a %s: 201, Users ACTIVE and later login', async (role) => {
      const key = randomUUID();
      const body = registerBody(`int01-${role.toLowerCase()}`, role);
      const registered = await register(h(), body, key);

      expect(registered.status).toBe(201);
      expect(registered.body?.id).toMatch(UUID_PATTERN);
      expect(registered.body).toStrictEqual({ id: registered.body?.id, name: body.name, email: body.email, role });
      expect(registered.text).not.toContain(body.password);

      const remote = await getRegistration(h(), key);
      expect(remote.status).toBe(200);
      expect(remote.body).toMatchObject({ id: registered.body?.id, status: 'ACTIVE', role });

      const session = await login(h(), body.email);
      expect(session.status).toBe(200);
      expect(session.body?.principal).toMatchObject({ userId: registered.body?.id, role });

      expect(h().queryAuthDb(`SELECT state FROM "Registration" WHERE id = '${key}'`)).toEqual(['COMPLETED']);
      expect(h().queryAuthDb(`SELECT status FROM "Credential" WHERE "userId" = '${registered.body?.id}'`)).toEqual(['ACTIVE']);
    });
  });

  it('INT-02 repeating the registration with the same key and payload returns the same identity', async () => {
    const key = randomUUID();
    const body = registerBody('int02');
    const first = await register(h(), body, key);
    const second = await register(h(), body, key);

    expect(first.status).toBe(201);
    expect(second.status).toBe(201);
    expect(second.body).toStrictEqual(first.body);
    expect(countUsers('registrationId', key)).toBe(1);
    expect(countUsers('emailNormalized', body.email)).toBe(1);
    expect(countAuth('Credential', 'userId', first.body?.id ?? '')).toBe(1);
  });

  it('INT-03 same key with a different payload returns 409 and leaves the original intact', async () => {
    const key = randomUUID();
    const body = registerBody('int03');
    const first = await register(h(), body, key);
    expect(first.status).toBe(201);

    const changed = await register(h(), { ...body, name: 'Different Name', email: `other-${body.email}` }, key);
    expect(changed.status).toBe(409);

    const remote = await getRegistration(h(), key);
    expect(remote.body).toMatchObject({ id: first.body?.id, name: body.name, email: body.email, status: 'ACTIVE' });
    expect(countUsers('emailNormalized', `other-${body.email}`)).toBe(0);
    expect((await login(h(), body.email)).status).toBe(200);
  });

  it('INT-04 an equivalent email already registered returns 409 and keeps the original account', async () => {
    const body = registerBody('int04');
    const first = await register(h(), body);
    expect(first.status).toBe(201);

    const duplicateKey = randomUUID();
    const duplicate = await register(
      h(),
      { ...body, name: 'Impostor', email: `  ${body.email.toUpperCase()}  `, password: 'Another-Password-123' },
      duplicateKey,
    );
    expect(duplicate.status).toBe(409);

    expect(countUsers('emailNormalized', body.email)).toBe(1);
    expect(countUsers('registrationId', duplicateKey)).toBe(0);
    const original = await login(h(), body.email);
    expect(original.status).toBe(200);
    expect(original.body?.principal.userId).toBe(first.body?.id);
    expect((await login(h(), body.email, 'Another-Password-123')).status).toBe(401);
  });

  it('INT-05 two simultaneous registrations with the same key converge to one identity', async () => {
    const key = randomUUID();
    const body = registerBody('int05');
    const responses = await Promise.all([register(h(), body, key), register(h(), body, key)]);

    // El contrato permite un conflicto transitorio (503 por claim ocupado); nunca otro código.
    for (const response of responses) expect([201, 503]).toContain(response.status);

    let final = responses.find((response) => response.status === 201);
    for (let attempt = 0; final === undefined && attempt < 10; attempt += 1) {
      await sleep(500);
      const retry = await register(h(), body, key);
      expect([201, 503]).toContain(retry.status);
      if (retry.status === 201) final = retry;
    }
    expect(final?.status).toBe(201);

    const retry = await register(h(), body, key);
    expect(retry.status).toBe(201);
    expect(retry.body).toStrictEqual(final?.body);
    for (const response of responses.filter((r) => r.status === 201)) expect(response.body).toStrictEqual(final?.body);

    expect(countUsers('registrationId', key)).toBe(1);
    expect(countUsers('emailNormalized', body.email)).toBe(1);
    expect(countAuth('Registration', 'id', key)).toBe(1);
    expect(countAuth('Credential', 'userId', final?.body?.id ?? '')).toBe(1);
    expect((await login(h(), body.email)).status).toBe(200);
  });
});
