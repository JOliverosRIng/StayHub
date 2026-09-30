import { randomUUID } from 'node:crypto';
import { UnauthorizedException } from '@nestjs/common';

import type { Clock } from '@auth/application/ports/clock.port';
import type { UuidGenerator } from '@auth/application/ports/random.port';
import type { AuthConfig } from '@auth/infrastructure/config/auth-config';
import { UsersServiceTokenProvider } from '@auth/infrastructure/security/users-service-token.provider';
import type { JwtConfig } from '../../../users-service/src/infrastructure/config/users-config';
import { verifyJwt } from '../../../users-service/src/infrastructure/security/service-jwt.verifier';
import { createAuthCryptoFixture, createRsaKeyPair } from '../helpers/crypto-fixture';

// Configuración B1 compartida: emisor real (UsersServiceTokenProvider) y receptor
// real de Users (verifyJwt). El recorrido HTTP login->perfil se acredita en task-06.
const OUTBOUND_ISSUER = 'stayhub-auth-service';
const OUTBOUND_AUDIENCE = 'stayhub-users-service';
const OUTBOUND_SCOPE = 'users:registration users:login-identity';

const clock: Clock = { now: (): Date => new Date() };
const uuids: UuidGenerator = { generate: randomUUID };

const fixture = createAuthCryptoFixture();
const outbound = createRsaKeyPair('auth-users-2026-01');

const providerConfig: AuthConfig = {
  ...fixture.config,
  outboundServiceJwt: {
    privateKey: outbound.privateKey,
    kid: outbound.kid,
    issuer: OUTBOUND_ISSUER,
    audience: OUTBOUND_AUDIENCE,
    scope: OUTBOUND_SCOPE,
    ttlSeconds: 60,
  },
};

const provider = new UsersServiceTokenProvider(providerConfig, clock, uuids);

function serviceJwtConfig(overrides: Partial<JwtConfig> = {}): JwtConfig {
  return {
    issuer: OUTBOUND_ISSUER,
    audience: OUTBOUND_AUDIENCE,
    kid: outbound.kid,
    publicKey: outbound.publicKey,
    ...overrides,
  };
}

describe('Confianza Auth->Users con emisor y verificador reales (task-02)', () => {
  it('el token de servicio real autoriza los dos scopes de Users', async () => {
    const token = await provider.issue();

    const payload = verifyJwt(token, serviceJwtConfig(), 300);

    expect(payload.iss).toBe(OUTBOUND_ISSUER);
    expect(payload.aud).toBe(OUTBOUND_AUDIENCE);
    expect(payload.scope).toBe(OUTBOUND_SCOPE);
    const scopes = String(payload.scope).split(' ');
    expect(scopes).toContain('users:registration');
    expect(scopes).toContain('users:login-identity');
  });

  it.each<[string, () => JwtConfig]>([
    ['clave ajena', (): JwtConfig => serviceJwtConfig({ publicKey: createRsaKeyPair('foreign').publicKey })],
    ['kid distinto', (): JwtConfig => serviceJwtConfig({ kid: 'other-kid' })],
    ['issuer distinto', (): JwtConfig => serviceJwtConfig({ issuer: 'other-issuer' })],
    ['audience distinta', (): JwtConfig => serviceJwtConfig({ audience: 'other-audience' })],
  ])('rechaza un token de servicio con %s', async (_case, config) => {
    const token = await provider.issue();

    expect(() => verifyJwt(token, config(), 300)).toThrow(UnauthorizedException);
  });

  it('el access JWT no sirve para el registro interno de Users', async () => {
    const accessToken = await fixture.issueAccessToken();

    expect(() => verifyJwt(accessToken, serviceJwtConfig(), 300)).toThrow(UnauthorizedException);
  });

  it('el JWT de servicio no sirve como JWT de perfil', async () => {
    const token = await provider.issue();
    const userJwtConfig: JwtConfig = {
      issuer: fixture.config.accessJwt.issuer,
      audience: fixture.config.accessJwt.audience,
      kid: fixture.accessKeys.kid,
      publicKey: fixture.accessKeys.publicKey,
    };

    expect(() => verifyJwt(token, userJwtConfig, 3600)).toThrow(UnauthorizedException);
  });
});
