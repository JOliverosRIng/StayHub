import { randomUUID } from 'node:crypto';
import { decodeJwt } from 'jose';

import type { TokenSigner } from '@auth/application/ports/token-signer.port';
import {
  ISSUE_SESSION_TOKENS,
  IssueSessionTokensService,
} from '@auth/application/sessions/issue-session-tokens.service';
import { Session } from '@auth/domain/sessions/session';
import { HmacRefreshTokenCodec } from '@auth/infrastructure/security/hmac-refresh-token.codec';
import { Rs256TokenService } from '@auth/infrastructure/security/rs256-token.service';
import { createAuthCryptoFixture } from '../helpers/crypto-fixture';
import { FakeClock } from '../helpers/fake-clock';

const NOW = new Date('2026-01-01T00:00:00.000Z');
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const fixture = createAuthCryptoFixture();
const uuid = { generate: randomUUID };

interface Harness {
  readonly service: IssueSessionTokensService;
  readonly codec: HmacRefreshTokenCodec;
  readonly signer: Rs256TokenService;
  readonly clock: FakeClock;
}

function build(signer?: TokenSigner): Harness {
  const clock = new FakeClock(NOW);
  const codec = new HmacRefreshTokenCodec(fixture.config);
  const realSigner = new Rs256TokenService(fixture.config, clock);
  const activeSigner = signer ?? realSigner;
  const service = new IssueSessionTokensService({
    codec,
    signer: activeSigner,
    uuid,
    clock,
  });
  return { service, codec, signer: realSigner, clock };
}

describe('IssueSessionTokensService (AUTH-066)', () => {
  it('exposes a DI token for the composition modules', () => {
    expect(typeof ISSUE_SESSION_TOKENS).toBe('symbol');
  });

  describe('RefreshTokenCodec', () => {
    it('generates 32 bytes of base64url entropy', () => {
      const { codec } = build();

      const raw = codec.generateRawToken();

      expect(raw).toMatch(/^[A-Za-z0-9_-]+$/);
      expect(Buffer.from(raw, 'base64url')).toHaveLength(32);
    });

    it('generates different raw tokens on each call', () => {
      const { codec } = build();

      expect(codec.generateRawToken()).not.toBe(codec.generateRawToken());
    });

    it('hashes to a stable 64-char HMAC for the same raw token and secret', () => {
      const { codec } = build();
      const raw = codec.generateRawToken();

      const first = codec.hash(raw);
      const second = codec.hash(raw);

      expect(first).toMatch(/^[a-f0-9]{64}$/);
      expect(first).toBe(second);
      expect(first).not.toBe(raw);
    });

    it('changes the hash when the secret changes', () => {
      const raw = 'fixed-raw-refresh-token';
      const withDefault = new HmacRefreshTokenCodec(fixture.config);
      const withOther = new HmacRefreshTokenCodec({
        ...fixture.config,
        refreshTokenHmacSecret: 'another-login-identifier-secret-0123456789',
      });

      expect(withDefault.hash(raw)).not.toBe(withOther.hash(raw));
    });
  });

  describe('issueNewSession', () => {
    it('creates a seven-day session and a matching refresh/access pair', async () => {
      const { service, codec, signer, clock } = build();

      const userId = randomUUID();
      const issued = await service.issueNewSession(userId, 'GUEST');

      const session = issued.session.snapshot();
      expect(session.id).toMatch(UUID_PATTERN);
      expect(session.userId).toBe(userId);
      expect(session.role).toBe('GUEST');
      expect(session.absoluteExpiresAt.getTime()).toBe(NOW.getTime() + 604_800_000);

      const refresh = issued.refreshToken.snapshot();
      expect(refresh.id).toMatch(UUID_PATTERN);
      expect(refresh.sessionId).toBe(session.id);
      expect(refresh.status).toBe('ACTIVE');
      expect(refresh.tokenHash).toBe(codec.hash(issued.rawRefreshToken));
      expect(refresh.tokenHash).toMatch(/^[a-f0-9]{64}$/);
      expect(refresh.expiresAt.getTime()).toBe(session.absoluteExpiresAt.getTime());

      const claims = await signer.verifyAccessToken(issued.accessToken);
      expect(claims).toMatchObject({ sub: userId, sid: session.id, role: 'GUEST' });
      expect(claims.jti).toMatch(UUID_PATTERN);
      expect(claims.exp - claims.iat).toBe(3600);
      expect(claims.iat).toBe(Math.floor(clock.now().getTime() / 1000));
    });

    it('signs access tokens with only the minimal canonical claims', async () => {
      const { service } = build();

      const issued = await service.issueNewSession(randomUUID(), 'OWNER');
      const payload = decodeJwt(issued.accessToken);

      expect(Object.keys(payload).sort()).toEqual(
        ['aud', 'exp', 'iat', 'iss', 'jti', 'role', 'sid', 'sub'].sort(),
      );
      expect(payload).not.toHaveProperty('email');
      expect(payload).not.toHaveProperty('name');
      expect(payload.role).toBe('OWNER');
    });
  });

  describe('issueForSession (rotation)', () => {
    it('issues new tokens for an existing session without recreating it', async () => {
      const { service, codec, signer, clock } = build();
      const session = Session.create(randomUUID(), randomUUID(), 'OWNER', NOW);
      const sessionId = session.snapshot().id;

      clock.advanceSeconds(120);
      const issued = await service.issueForSession(session);

      expect(issued).not.toHaveProperty('session');
      const refresh = issued.refreshToken.snapshot();
      expect(refresh.id).toMatch(UUID_PATTERN);
      expect(refresh.sessionId).toBe(sessionId);
      expect(refresh.issuedAt.getTime()).toBe(clock.now().getTime());
      expect(refresh.expiresAt.getTime()).toBe(
        session.snapshot().absoluteExpiresAt.getTime(),
      );
      expect(refresh.tokenHash).toBe(codec.hash(issued.rawRefreshToken));

      const claims = await signer.verifyAccessToken(issued.accessToken);
      expect(claims).toMatchObject({
        sub: session.snapshot().userId,
        sid: sessionId,
        role: 'OWNER',
      });
      expect(claims.exp - claims.iat).toBe(3600);
    });

    it('produces fresh identifiers and raw tokens on each issuance', async () => {
      const { service } = build();
      const session = Session.create(randomUUID(), randomUUID(), 'GUEST', NOW);

      const first = await service.issueForSession(session);
      const second = await service.issueForSession(session);

      expect(first.rawRefreshToken).not.toBe(second.rawRefreshToken);
      expect(first.refreshToken.snapshot().id).not.toBe(second.refreshToken.snapshot().id);
      expect(first.accessToken).not.toBe(second.accessToken);
    });
  });

  describe('expiry boundaries', () => {
    it('keeps the absolute session expiry and a 3600s access token near day seven', async () => {
      const { service, signer, clock } = build();
      const issued = await service.issueNewSession(randomUUID(), 'GUEST');
      const absoluteExpiry = issued.session.snapshot().absoluteExpiresAt;

      clock.set(new Date(absoluteExpiry.getTime() - 1000));
      const rotated = await service.issueForSession(issued.session);

      expect(rotated.refreshToken.snapshot().expiresAt.getTime()).toBe(absoluteExpiry.getTime());
      const claims = await signer.verifyAccessToken(rotated.accessToken);
      expect(claims.exp - claims.iat).toBe(3600);
    });

    it('refuses to issue a refresh token once the session has expired', async () => {
      const { service, clock } = build();
      const issued = await service.issueNewSession(randomUUID(), 'GUEST');
      const absoluteExpiry = issued.session.snapshot().absoluteExpiresAt;

      clock.set(new Date(absoluteExpiry.getTime()));

      await expect(service.issueForSession(issued.session)).rejects.toThrow();
    });
  });

  it('propagates a signing failure without producing persisted state', async () => {
    const failing: TokenSigner = {
      signAccessToken: (): Promise<string> => Promise.reject(new Error('sign-failure')),
      verifyAccessToken: (): Promise<never> => Promise.reject(new Error('unused')),
    };
    const { service } = build(failing);

    await expect(service.issueNewSession(randomUUID(), 'GUEST')).rejects.toThrow('sign-failure');
  });
});
