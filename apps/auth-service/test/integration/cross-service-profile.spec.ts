import { provisionAuthUsersHarness, type AuthUsersHarness } from '../helpers/auth-users-harness';
import {
  getProfile,
  login,
  patchProfile,
  register,
  registerBody,
  syntheticEmail,
  type RegisterResponse,
} from '../helpers/auth-users-flows';

// Perfil con access JWT emitido por Auth y validado por Users real (task-06):
// INT-09, INT-10 e INT-11. Los tokens proceden siempre de un login real.

describe('Cross-service profile Auth<->Users (task-06)', () => {
  let harness: AuthUsersHarness | undefined;
  const h = (): AuthUsersHarness => harness as AuthUsersHarness;

  async function account(prefix: string): Promise<{ email: string; user: RegisterResponse; accessToken: string }> {
    const body = registerBody(prefix);
    const registered = await register(h(), body);
    expect(registered.status).toBe(201);
    const session = await login(h(), body.email);
    expect(session.status).toBe(200);
    return { email: body.email, user: registered.body!, accessToken: session.body!.accessToken };
  }

  beforeAll(async () => {
    harness = await provisionAuthUsersHarness();
  }, 900_000);

  afterAll(async () => {
    await harness?.dispose();
  }, 120_000);

  it('INT-09 the login access token reads and updates the own profile with expectedVersion', async () => {
    const { user, accessToken } = await account('int09');

    const current = await getProfile(h(), user.id, accessToken);
    expect(current.status).toBe(200);
    expect(current.body).toMatchObject({ id: user.id, name: user.name, email: user.email, role: 'GUEST' });
    const version = current.body!.version;

    const updated = await patchProfile(h(), user.id, accessToken, {
      expectedVersion: version,
      name: 'Updated Name',
      phone: '+573001234567',
      preferences: { language: 'es' },
    });
    expect(updated.status).toBe(200);
    expect(updated.body).toMatchObject({
      id: user.id,
      name: 'Updated Name',
      phone: '+573001234567',
      preferences: { language: 'es' },
      version: version + 1,
    });

    const stale = await patchProfile(h(), user.id, accessToken, { expectedVersion: version, name: 'Stale Write' });
    expect(stale.status).toBe(409);
    expect((await getProfile(h(), user.id, accessToken)).body).toMatchObject({ name: 'Updated Name', version: version + 1 });

    expect((await getProfile(h(), user.id, 'not-a-jwt')).status).toBe(401);
  });

  it('INT-10 changing the profile email moves login to the new address', async () => {
    const { email, user, accessToken } = await account('int10');
    const current = await getProfile(h(), user.id, accessToken);
    const newEmail = syntheticEmail('int10-new');

    const updated = await patchProfile(h(), user.id, accessToken, {
      expectedVersion: current.body!.version,
      email: newEmail,
    });
    expect(updated.status).toBe(200);
    expect(updated.body?.email).toBe(newEmail);

    const viaNew = await login(h(), newEmail);
    expect(viaNew.status).toBe(200);
    expect(viaNew.body?.principal.userId).toBe(user.id);
    expect((await login(h(), email)).status).toBe(401);
  });

  it('INT-11 a valid JWT of another user gets 403 and changes nothing', async () => {
    const alice = await account('int11-alice');
    const bob = await account('int11-bob');
    const before = await getProfile(h(), bob.user.id, bob.accessToken);
    expect(before.status).toBe(200);

    expect((await getProfile(h(), bob.user.id, alice.accessToken)).status).toBe(403);
    const write = await patchProfile(h(), bob.user.id, alice.accessToken, {
      expectedVersion: before.body!.version,
      name: 'Hijacked',
    });
    expect(write.status).toBe(403);

    const after = await getProfile(h(), bob.user.id, bob.accessToken);
    expect(after.body).toStrictEqual(before.body);
  });
});
