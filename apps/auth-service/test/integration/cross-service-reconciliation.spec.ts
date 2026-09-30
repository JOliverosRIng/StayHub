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
  sleep,
  usersStatus,
  waitFor,
} from '../helpers/auth-users-flows';

// Reconciliación de registros interrumpidos (task-07): INT-15.
// Reconciliador real de Auth con intervalo de 1 s. El TTL (mínimo configurable 60 s)
// se vence preparando `expiresAt` en la base desechable de Auth, sin esperar 15 min.

const CREATE = /^\/internal\/v1\/registrations$/;
const ACTIVATE = /^\/internal\/v1\/registrations\/[0-9a-f-]+\/activate$/;
const TERMINAL = new Set(['COMPLETED', 'CANCELLED']);

describe('Cross-service registration reconciliation (task-07)', () => {
  let harness: AuthUsersHarness | undefined;
  const h = (): AuthUsersHarness => harness as AuthUsersHarness;
  const proxy = (): UsersFaultProxy => h().faults as UsersFaultProxy;

  // Solo se modifica la fila cuando ningún worker la tiene reclamada: el
  // reconciliador persiste el snapshot completo y pisaría un cambio concurrente.
  const expire = async (registrationId: string): Promise<void> => {
    const updated = await waitFor(
      () =>
        h().queryAuthDb(
          `WITH expired AS (UPDATE "Registration" SET "expiresAt" = now() - interval '1 minute', "nextAttemptAt" = now() WHERE id = '${registrationId}' AND "processingOwner" IS NULL RETURNING id) SELECT id FROM expired`,
        ),
      (rows) => rows.length === 1,
      10_000,
      50,
    );
    expect(updated).toEqual([registrationId]);
  };
  const settle = (registrationId: string): Promise<string | undefined> =>
    waitFor(
      () => registrationState(h(), registrationId),
      (state) => state !== undefined && TERMINAL.has(state),
      30_000,
    );

  beforeAll(async () => {
    harness = await provisionAuthUsersHarness({
      usersFaultProxy: true,
      authEnv: { AUTH_RECONCILER_INTERVAL_SECONDS: '1', AUTH_USERS_CIRCUIT_RESET_MS: '1000' },
    });
  }, 900_000);

  afterEach(() => {
    proxy().clear();
    proxy().resetHits();
  });

  afterAll(async () => {
    await harness?.dispose();
  }, 120_000);

  it('interrupted before creating the Users identity: waits within TTL, cancels after TTL', async () => {
    proxy().inject({ method: 'POST', path: CREATE, mode: 'refuse', times: 2 });
    const key = randomUUID();
    const body = registerBody('int15-before-create');
    expect((await register(h(), body, key)).status).toBe(503);
    expect(usersStatus(h(), key)).toBeUndefined();

    // Dentro del TTL: el reconciliador no puede crear sin payload y espera.
    await sleep(3_000);
    expect(registrationState(h(), key)).toBe('STARTED');

    // Vencido el TTL: la ausencia confirmada en Users permite cerrar como CANCELLED.
    await expire(key);
    expect(await settle(key)).toBe('CANCELLED');
    expect(usersStatus(h(), key)).toBeUndefined();
    expect(credentialStatus(h(), key)).toBeUndefined();
    expect((await register(h(), body, key)).status).toBe(409);

    // Carrera con una creación tardía (petición en vuelo que llega a Users después):
    // la identidad queda PENDING, Auth no la activa y no permite login.
    const userId = h().queryAuthDb(`SELECT "userId" FROM "Registration" WHERE id = '${key}'`)[0];
    const late = await h().usersRequest('/internal/v1/registrations', {
      token: await h().usersServiceToken({ scope: h().registrationScope }),
      body: { registrationId: key, userId, name: body.name, email: body.email, role: body.role },
    });
    expect(late.status).toBe(201);
    await sleep(3_000);
    expect(registrationState(h(), key)).toBe('CANCELLED');
    expect(usersStatus(h(), key)).toBe('PENDING');
    expect((await register(h(), body, key)).status).toBe(409);
    expect((await login(h(), body.email)).status).toBe(401);
  });

  it('interrupted after create and before activation: the reconciler completes it', async () => {
    proxy().inject({ method: 'POST', path: ACTIVATE, mode: 'refuse', times: 2 });
    const key = randomUUID();
    const body = registerBody('int15-before-activate');
    expect((await register(h(), body, key)).status).toBe(503);
    expect(usersStatus(h(), key)).toBe('PENDING');
    expect(registrationState(h(), key)).toBe('CREDENTIAL_ACTIVE');

    // Sin reintento del cliente: el reconciliador activa en Users y completa.
    expect(await settle(key)).toBe('COMPLETED');
    expect(usersStatus(h(), key)).toBe('ACTIVE');
    expect(credentialStatus(h(), key)).toBe('ACTIVE');
    expect((await login(h(), body.email)).status).toBe(200);
  });

  it('lost create responses and expired TTL: the PENDING identity is cancelled in Users', async () => {
    proxy().inject({ method: 'POST', path: CREATE, mode: 'drop-response', times: 2 });
    const key = randomUUID();
    const body = registerBody('int15-pending-expired');
    expect((await register(h(), body, key)).status).toBe(503);
    expect(usersStatus(h(), key)).toBe('PENDING');
    expect(registrationState(h(), key)).toBe('STARTED');

    await expire(key);
    expect(await settle(key)).toBe('CANCELLED');
    expect(usersStatus(h(), key)).toBe('CANCELLED');
    expect((await register(h(), body, key)).status).toBe(409);
    expect((await login(h(), body.email)).status).toBe(401);
  });

  it('lost activate responses and expired TTL: the ACTIVE identity is completed, never cancelled', async () => {
    proxy().inject({ method: 'POST', path: ACTIVATE, mode: 'drop-response', times: 2 });
    const key = randomUUID();
    const body = registerBody('int15-active-expired');
    expect((await register(h(), body, key)).status).toBe(503);
    expect(usersStatus(h(), key)).toBe('ACTIVE');

    await expire(key);
    expect(await settle(key)).toBe('COMPLETED');
    expect(usersStatus(h(), key)).toBe('ACTIVE');
    expect(credentialStatus(h(), key)).toBe('ACTIVE');
    expect((await login(h(), body.email)).status).toBe(200);
  });

  it('Users unavailable during compensation keeps it pending (not treated as absent)', async () => {
    proxy().inject({ method: 'POST', path: CREATE, mode: 'refuse', times: 2 });
    const key = randomUUID();
    expect((await register(h(), registerBody('int15-users-down'), key)).status).toBe(503);

    // Users caído con el TTL vencido: la ausencia no puede confirmarse (sin 404
    // autenticado), así que el registro no se cierra ni se da por cancelado.
    await h().stopUsers();
    try {
      await expire(key);
      await sleep(4_000);
      expect(['STARTED', 'COMPENSATING']).toContain(registrationState(h(), key));
    } finally {
      await h().startUsers();
    }
    expect(await settle(key)).toBe('CANCELLED');
  });

  it('leaves no ACTIVE identity with a revoked or missing credential', () => {
    expect(activeUsersWithoutUsableCredential(h())).toEqual([]);
    expect(h().queryAuthDb(`SELECT count(*) FROM "Registration" WHERE state NOT IN ('COMPLETED','CANCELLED')`)).toEqual(['0']);
  });
});
