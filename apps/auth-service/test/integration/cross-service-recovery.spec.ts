import { randomUUID } from 'node:crypto';

import { provisionAuthUsersHarness, type AuthUsersHarness } from '../helpers/auth-users-harness';
import type { UsersFaultProxy } from '../helpers/users-fault-proxy';
import {
  activeUsersWithoutUsableCredential,
  credentialStatus,
  login,
  register,
  registerBody,
  registrationState,
  usersStatus,
  PASSWORD,
} from '../helpers/auth-users-flows';

// Recuperación ante fallos de Users (task-07): INT-13 e INT-14.
// Users real detrás del proxy de fallos del harness. El reconciliador se deja con
// un intervalo largo para que la convergencia observada sea la del reintento del
// cliente con la misma Idempotency-Key (INT-15 cubre el reconciliador).

const CREATE = /^\/internal\/v1\/registrations$/;
const ACTIVATE = /^\/internal\/v1\/registrations\/[0-9a-f-]+\/activate$/;

describe('Cross-service recovery Auth<->Users (task-07)', () => {
  let harness: AuthUsersHarness | undefined;
  const h = (): AuthUsersHarness => harness as AuthUsersHarness;
  const proxy = (): UsersFaultProxy => h().faults as UsersFaultProxy;
  const usersRows = (registrationId: string): number =>
    Number(h().queryUsersDb(`SELECT count(*) FROM "User" WHERE "registrationId" = '${registrationId}'`)[0]);

  beforeAll(async () => {
    harness = await provisionAuthUsersHarness({
      usersFaultProxy: true,
      authEnv: { AUTH_RECONCILER_INTERVAL_SECONDS: '3600' },
    });
  }, 900_000);

  afterEach(() => {
    proxy().clear();
    proxy().resetHits();
  });

  afterAll(async () => {
    await harness?.dispose();
  }, 120_000);

  describe('INT-13 Users unreachable', () => {
    it('registration and login answer a safe 503 while Users is down and nothing is confirmed', async () => {
      const existing = registerBody('int13-existing');
      expect((await register(h(), existing)).status).toBe(201);

      await h().stopUsers();
      const key = randomUUID();
      const body = registerBody('int13-down');
      let registration;
      let session;
      try {
        registration = await register(h(), body, key);
        session = await login(h(), existing.email);
      } finally {
        await h().startUsers();
      }

      expect(registration.status).toBe(503);
      expect(registration.body).toMatchObject({ status: 503, code: 'DEPENDENCY_UNAVAILABLE' });
      expect(registration.text).not.toContain(PASSWORD);
      expect(registration.text).not.toMatch(/ECONNREFUSED|stack|127\.0\.0\.1/i);
      expect(session.status).toBe(503);
      expect(session.body).not.toHaveProperty('accessToken');

      // Nada confirmado: sin identidad en Users, sin credencial y registro no completado.
      expect(usersRows(key)).toBe(0);
      expect(registrationState(h(), key)).toBe('STARTED');
      expect(credentialStatus(h(), key)).toBeUndefined();
      expect((await login(h(), body.email)).status).toBe(401);

      // Con Users disponible, el reintento con la misma key converge.
      const retry = await register(h(), body, key);
      expect(retry.status).toBe(201);
      expect(usersStatus(h(), key)).toBe('ACTIVE');
      expect((await login(h(), body.email)).status).toBe(200);
      expect((await login(h(), existing.email)).status).toBe(200);
    });

    it('Users unreachable at activation leaves no usable account until the retry completes it', async () => {
      proxy().inject({ method: 'POST', path: ACTIVATE, mode: 'refuse', times: 2 });
      const key = randomUUID();
      const body = registerBody('int13-activate');

      const first = await register(h(), body, key);
      expect(first.status).toBe(503);
      expect(proxy().hits().filter((hit) => hit.fault === 'refuse')).toHaveLength(2);
      expect(usersStatus(h(), key)).toBe('PENDING');
      expect(registrationState(h(), key)).toBe('CREDENTIAL_ACTIVE');
      // Registro parcial no confirmado: la identidad PENDING no permite login.
      expect((await login(h(), body.email)).status).toBe(401);

      const retry = await register(h(), body, key);
      expect(retry.status).toBe(201);
      expect(usersStatus(h(), key)).toBe('ACTIVE');
      expect(registrationState(h(), key)).toBe('COMPLETED');
      expect((await login(h(), body.email)).status).toBe(200);
    });
  });

  describe('INT-14 Users confirms a write but Auth loses the response', () => {
    it('one lost create response is absorbed by the client idempotent retry', async () => {
      proxy().inject({ method: 'POST', path: CREATE, mode: 'drop-response', times: 1 });
      const key = randomUUID();
      const body = registerBody('int14-one');

      const response = await register(h(), body, key);
      expect(response.status).toBe(201);
      const creates = proxy().hits().filter((hit) => CREATE.test(hit.path));
      expect(creates.map((hit) => [hit.fault, hit.upstreamStatus])).toEqual([
        ['drop-response', 201],
        [null, 201],
      ]);
      expect(usersRows(key)).toBe(1);
      expect(usersStatus(h(), key)).toBe('ACTIVE');
    });

    it('two lost create responses give 503; the retry with the same key reuses the identity', async () => {
      proxy().inject({ method: 'POST', path: CREATE, mode: 'drop-response', times: 2 });
      const key = randomUUID();
      const body = registerBody('int14-create');

      const first = await register(h(), body, key);
      expect(first.status).toBe(503);
      expect(usersRows(key)).toBe(1);
      expect(usersStatus(h(), key)).toBe('PENDING');
      expect(registrationState(h(), key)).toBe('STARTED');

      const retry = await register(h(), body, key);
      expect(retry.status).toBe(201);
      expect(usersRows(key)).toBe(1);
      expect(usersStatus(h(), key)).toBe('ACTIVE');
      expect(h().queryUsersDb(`SELECT id FROM "User" WHERE "registrationId" = '${key}'`)).toEqual([retry.body?.id]);
      expect((await login(h(), body.email)).status).toBe(200);
    });

    it('two lost activate responses never cancel the ACTIVE user; the retry completes', async () => {
      proxy().inject({ method: 'POST', path: ACTIVATE, mode: 'drop-response', times: 2 });
      const key = randomUUID();
      const body = registerBody('int14-activate');

      const first = await register(h(), body, key);
      expect(first.status).toBe(503);
      const activations = proxy().hits().filter((hit) => ACTIVATE.test(hit.path));
      expect(activations.map((hit) => hit.upstreamStatus)).toEqual([200, 200]);
      expect(usersStatus(h(), key)).toBe('ACTIVE');
      expect(registrationState(h(), key)).toBe('CREDENTIAL_ACTIVE');

      const retry = await register(h(), body, key);
      expect(retry.status).toBe(201);
      expect(usersStatus(h(), key)).toBe('ACTIVE');
      expect(registrationState(h(), key)).toBe('COMPLETED');
      expect(credentialStatus(h(), key)).toBe('ACTIVE');
      expect((await login(h(), body.email)).status).toBe(200);
    });
  });

  it('leaves no ACTIVE identity with a revoked or missing credential', () => {
    expect(activeUsersWithoutUsableCredential(h())).toEqual([]);
  });
});
