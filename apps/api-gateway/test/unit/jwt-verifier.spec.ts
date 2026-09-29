import { generateKeyPairSync } from 'node:crypto';

import { SignJWT, importPKCS8 } from 'jose';

import { JwtVerifierService } from '@gateway/infrastructure/security/jwt-verifier.service';

import { createTestGatewayConfig } from '../support/gateway-config-fixture';

const { config, servicePublicKeyPem } = createTestGatewayConfig();

const signUserToken = async (
  claims: Record<string, unknown>,
  options: { kid?: string; alg?: string; key?: string; issuer?: string; audience?: string } = {},
): Promise<string> => {
  const kid = options.kid ?? 'stayhub-auth-2026-01';
  const key = await importPKCS8(options.key ?? config.serviceJwt.privateKey, 'RS256');
  return new SignJWT(claims)
    .setProtectedHeader({ alg: options.alg ?? 'RS256', kid, typ: 'JWT' })
    .setIssuer(options.issuer ?? 'https://auth.stayhub.internal')
    .setAudience(options.audience ?? 'stayhub-api')
    .sign(key);
};

const validClaims = {
  sub: '3f2504e0-4f89-41d3-9a0c-0305e82c3301',
  sid: '7c9e6679-7425-40de-944b-e07fc1f90ae7',
  role: 'OWNER',
  jti: '550e8400-e29b-41d4-a716-446655440000',
  iat: Math.floor(Date.now() / 1000),
  exp: Math.floor(Date.now() / 1000) + 3600,
};

describe('JwtVerifierService (GW-016)', () => {
  const verifier = new JwtVerifierService(config);

  it('verifica un token de usuario valido y devuelve sus claims', async () => {
    const token = await signUserToken(validClaims);

    const claims = await verifier.verify(token);

    expect(claims).toEqual(validClaims);
  });

  it('rechaza un kid fuera de la allowlist', async () => {
    const token = await signUserToken(validClaims, { kid: 'kid-desconocido' });

    await expect(verifier.verify(token)).rejects.toThrow(/kid/);
  });

  it('rechaza un algoritmo distinto de RS256', async () => {
    const token = await signUserToken(validClaims, { alg: 'RS512' });

    await expect(verifier.verify(token)).rejects.toBeDefined();
  });

  it('rechaza un token sin cabecera kid', async () => {
    const key = await importPKCS8(config.serviceJwt.privateKey, 'RS256');
    const token = await new SignJWT(validClaims)
      .setProtectedHeader({ alg: 'RS256', typ: 'JWT' })
      .setIssuer('https://auth.stayhub.internal')
      .setAudience('stayhub-api')
      .sign(key);

    await expect(verifier.verify(token)).rejects.toThrow(/kid/);
  });

  it('rechaza un issuer distinto del configurado', async () => {
    const token = await signUserToken(validClaims, { issuer: 'https://otro-issuer' });

    await expect(verifier.verify(token)).rejects.toBeDefined();
  });

  it('rechaza una audience distinta de la configurada', async () => {
    const token = await signUserToken(validClaims, { audience: 'otra-api' });

    await expect(verifier.verify(token)).rejects.toBeDefined();
  });

  it('rechaza un token expirado', async () => {
    const now = Math.floor(Date.now() / 1000);
    const token = await signUserToken({ ...validClaims, iat: now - 7200, exp: now - 3600 });

    await expect(verifier.verify(token)).rejects.toBeDefined();
  });

  it('rechaza un token sin firma valida', async () => {
    const other = generateKeyPairSync('rsa', {
      modulusLength: 2048,
      publicKeyEncoding: { type: 'spki', format: 'pem' },
      privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
    });
    const token = await signUserToken(validClaims, { key: other.privateKey });

    await expect(verifier.verify(token)).rejects.toBeDefined();
  });

  it('rechaza claims con formato invalido aunque la firma sea correcta', async () => {
    const invalidCases: Record<string, unknown>[] = [
      { ...validClaims, sub: 'no-es-uuid' },
      { ...validClaims, sid: 'no-es-uuid' },
      { ...validClaims, jti: 'no-es-uuid' },
      { ...validClaims, role: 'SUPERADMIN' },
      { ...validClaims, role: 'host' },
    ];
    for (const claims of invalidCases) {
      const token = await signUserToken(claims);
      await expect(verifier.verify(token)).rejects.toBeDefined();
    }
  });

  it('acepta los tres roles del contrato', async () => {
    for (const role of ['GUEST', 'OWNER', 'ADMIN']) {
      const token = await signUserToken({ ...validClaims, role });
      await expect(verifier.verify(token)).resolves.toMatchObject({ role });
    }
  });

  it('exige los claims sub, sid, role, jti, iat y exp', async () => {
    for (const missing of ['sub', 'sid', 'role', 'jti', 'iat', 'exp']) {
      const claims = { ...validClaims } as Record<string, unknown>;
      delete claims[missing];
      const token = await signUserToken(claims);

      await expect(verifier.verify(token)).rejects.toBeDefined();
    }
  });

  it('rechaza un token de servicio del Gateway presentado como bearer de usuario', async () => {
    const { ServiceTokenProvider } = await import(
      '@gateway/infrastructure/service-auth/service-token.provider'
    );
    const token = await new ServiceTokenProvider(config).issue();

    await expect(verifier.verify(token)).rejects.toBeDefined();
  });

  it('no acepta una clave publica que no corresponde al kid firmado', async () => {
    const impostor = generateKeyPairSync('rsa', {
      modulusLength: 2048,
      publicKeyEncoding: { type: 'spki', format: 'pem' },
      privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
    });
    const token = await signUserToken(validClaims, { key: impostor.privateKey });

    await expect(verifier.verify(token)).rejects.toBeDefined();
    expect(servicePublicKeyPem).toContain('BEGIN PUBLIC KEY');
  });
});
