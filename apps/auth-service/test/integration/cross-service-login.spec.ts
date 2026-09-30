import { decodeJwt, decodeProtectedHeader } from 'jose';

import { loadDevEnvironment, provisionAuthUsersHarness, type AuthUsersHarness } from '../helpers/auth-users-harness';
import {
  createUsersIdentity,
  login,
  refresh,
  register,
  registerBody,
  stableProblem,
  syntheticEmail,
  validateSession,
  PASSWORD,
  type RegisterResponse,
} from '../helpers/auth-users-flows';

// Login y refresh cross-service Auth <-> Users real sin Gateway (task-06):
// INT-06, INT-07 e INT-12.

describe('Cross-service login Auth<->Users (task-06)', () => {
  let harness: AuthUsersHarness | undefined;
  const h = (): AuthUsersHarness => harness as AuthUsersHarness;
  const env = loadDevEnvironment().env;

  const sessionCount = (userId?: string): number =>
    Number(
      h().queryAuthDb(
        userId === undefined ? 'SELECT count(*) FROM "Session"' : `SELECT count(*) FROM "Session" WHERE "userId" = '${userId}'`,
      )[0],
    );

  async function registered(prefix: string): Promise<{ email: string; user: RegisterResponse }> {
    const body = registerBody(prefix);
    const response = await register(h(), body);
    expect(response.status).toBe(201);
    return { email: body.email, user: response.body as RegisterResponse };
  }

  beforeAll(async () => {
    harness = await provisionAuthUsersHarness();
  }, 900_000);

  afterAll(async () => {
    await harness?.dispose();
  }, 120_000);

  it('INT-06 login with a non-normalized email returns 200 and tokens issued by Auth', async () => {
    const { email, user } = await registered('int06');
    const response = await login(h(), `  ${email.toUpperCase()}  `);

    expect(response.status).toBe(200);
    const body = response.body!;
    expect(body.principal).toMatchObject({ userId: user.id, role: 'GUEST' });
    expect(body.refreshToken.length).toBeGreaterThan(0);
    expect(body.expiresIn).toBeGreaterThan(0);

    const header = decodeProtectedHeader(body.accessToken);
    const claims = decodeJwt(body.accessToken);
    expect(header).toMatchObject({ alg: 'RS256', kid: env.AUTH_JWT_ACTIVE_KID });
    expect(claims).toMatchObject({
      iss: env.AUTH_JWT_ISSUER,
      aud: env.AUTH_JWT_AUDIENCE,
      sub: user.id,
    });
    // Los mismos valores que Users exige para aceptar el access JWT.
    expect(env.USERS_JWT_ISSUER).toBe(env.AUTH_JWT_ISSUER);
    expect(env.USERS_JWT_KID).toBe(env.AUTH_JWT_ACTIVE_KID);
    expect(sessionCount(user.id)).toBe(1);
  });

  it('INT-07 wrong password, absent, PENDING and CANCELLED users get a generic 401 and no session', async () => {
    const { email, user } = await registered('int07');
    const pending = await createUsersIdentity(h(), 'PENDING');
    const cancelled = await createUsersIdentity(h(), 'CANCELLED');
    const before = sessionCount();

    const responses = [
      await login(h(), email, 'Wrong-Password-123456'),
      await login(h(), syntheticEmail('int07-absent')),
      await login(h(), pending.email),
      await login(h(), cancelled.email),
    ];

    for (const response of responses) {
      expect(response.status).toBe(401);
      expect(response.body).not.toHaveProperty('accessToken');
      expect(response.body).not.toHaveProperty('refreshToken');
      expect(response.text).not.toContain(PASSWORD);
    }
    const [first, ...others] = responses.map((response) => stableProblem(response.body));
    for (const other of others) expect(other).toStrictEqual(first);

    expect(sessionCount()).toBe(before);
    expect(sessionCount(user.id)).toBe(0);
    expect(sessionCount(pending.userId)).toBe(0);
    expect(sessionCount(cancelled.userId)).toBe(0);
  });

  it('INT-12 refresh rotates, replay is 401 and Auth then reports the session invalid', async () => {
    const { email, user } = await registered('int12');
    const first = await login(h(), email);
    expect(first.status).toBe(200);
    const original = first.body!;

    expect((await validateSession(h(), original.principal.sessionId, user.id)).status).toBe(200);

    const rotated = await refresh(h(), original.refreshToken);
    expect(rotated.status).toBe(200);
    expect(rotated.body?.refreshToken).not.toBe(original.refreshToken);
    expect(rotated.body?.accessToken).not.toBe(original.accessToken);
    expect(rotated.body?.principal).toMatchObject({ userId: user.id, sessionId: original.principal.sessionId });

    const replay = await refresh(h(), original.refreshToken);
    expect(replay.status).toBe(401);
    expect(replay.body).not.toHaveProperty('accessToken');

    // La reutilización revoca la familia: ni la sesión ni el refresh sucesor sirven.
    expect((await validateSession(h(), original.principal.sessionId, user.id)).status).toBe(401);
    expect((await refresh(h(), rotated.body?.refreshToken ?? '')).status).toBe(401);
    expect(
      h().queryAuthDb(`SELECT "revokeReason" FROM "Session" WHERE id = '${original.principal.sessionId}'`),
    ).toEqual(['REFRESH_REUSE']);

    // La cuenta sigue operativa: un login nuevo abre otra sesión válida.
    const again = await login(h(), email);
    expect(again.status).toBe(200);
    expect((await validateSession(h(), again.body?.principal.sessionId ?? '', user.id)).status).toBe(200);
  });
});
