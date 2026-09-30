import { randomUUID } from 'node:crypto';

import { provisionAuthUsersHarness, type AuthUsersHarness } from '../helpers/auth-users-harness';
import {
  getProfile,
  login,
  patchProfile,
  refresh,
  register,
  registerBody,
  validateSession,
} from '../helpers/auth-users-flows';

// Reinicio del entorno integrado (task-07): INT-17. Se detienen Auth y Users, se
// reinician sus PostgreSQL y Redis y se vuelven a arrancar los mismos procesos
// reales con la misma configuración persistente.

describe('Cross-service restart Auth<->Users (task-07)', () => {
  let harness: AuthUsersHarness | undefined;
  const h = (): AuthUsersHarness => harness as AuthUsersHarness;

  beforeAll(async () => {
    harness = await provisionAuthUsersHarness();
  }, 900_000);

  afterAll(async () => {
    await harness?.dispose();
  }, 120_000);

  it('INT-17 the user persists and can log in again after restarting every service', async () => {
    const key = randomUUID();
    const body = registerBody('int17', 'OWNER');
    const registered = await register(h(), body, key);
    expect(registered.status).toBe(201);
    const userId = registered.body!.id;

    const before = await login(h(), body.email);
    expect(before.status).toBe(200);
    const profile = await getProfile(h(), userId, before.body!.accessToken);
    const updated = await patchProfile(h(), userId, before.body!.accessToken, {
      expectedVersion: profile.body!.version,
      name: 'Persisted Owner',
    });
    expect(updated.status).toBe(200);

    await h().stopAuth();
    await h().stopUsers();
    await h().restartInfrastructure();
    await h().startUsers();
    await h().startAuth();

    expect((await h().authRequest('/health/ready')).status).toBe(200);
    expect((await h().usersRequest('/health/ready')).status).toBe(200);

    const after = await login(h(), body.email);
    expect(after.status).toBe(200);
    expect(after.body?.principal).toMatchObject({ userId, role: 'OWNER' });

    const persisted = await getProfile(h(), userId, after.body!.accessToken);
    expect(persisted.status).toBe(200);
    expect(persisted.body).toMatchObject({ id: userId, name: 'Persisted Owner', version: updated.body!.version });

    // Idempotencia y sesiones anteriores sobreviven al reinicio.
    const replay = await register(h(), body, key);
    expect(replay.status).toBe(201);
    expect(replay.body?.id).toBe(userId);
    expect((await validateSession(h(), before.body!.principal.sessionId, userId)).status).toBe(200);
    const rotated = await refresh(h(), before.body!.refreshToken);
    expect(rotated.status).toBe(200);
    expect(rotated.body?.principal.sessionId).toBe(before.body!.principal.sessionId);
  });
});
