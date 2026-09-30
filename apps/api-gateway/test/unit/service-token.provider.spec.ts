import { decodeJwt, decodeProtectedHeader, importSPKI, jwtVerify } from 'jose';

import { ServiceTokenProvider } from '@gateway/infrastructure/service-auth/service-token.provider';

import { createTestGatewayConfig } from '../support/gateway-config-fixture';

describe('ServiceTokenProvider (GW-015)', () => {
  const { config, servicePublicKeyPem } = createTestGatewayConfig();
  const provider = new ServiceTokenProvider(config);
  const publicKey = importSPKI(servicePublicKeyPem, 'RS256');

  it('emite un JWT compacto firmado con RS256 y su kid propio', async () => {
    const token = await provider.issue();
    const header = decodeProtectedHeader(token);

    expect(token.split('.')).toHaveLength(3);
    expect(header.alg).toBe('RS256');
    expect(header.typ).toBe('JWT');
    expect(header.kid).toBe('gateway-2026-01');
  });

  it('la firma valida contra la clave publica del Gateway', async () => {
    const token = await provider.issue();

    const verified = await jwtVerify(token, await publicKey, {
      algorithms: ['RS256'],
      issuer: 'stayhub-api-gateway',
      audience: 'stayhub-auth-service',
    });

    expect(verified.payload.sub).toBe('api-gateway');
    expect(verified.payload.scope).toBe('auth:invoke');
  });

  it('no acepta el token como si fuera un bearer de usuario', async () => {
    const token = await provider.issue();

    await expect(
      jwtVerify(token, await publicKey, {
        algorithms: ['RS256'],
        issuer: 'https://auth.stayhub.internal',
        audience: 'stayhub-api',
      }),
    ).rejects.toBeDefined();
  });

  it('no incluye claims de usuario: ni sid, ni role, ni rol autoritativo', async () => {
    const token = await provider.issue();
    const payload = decodeJwt(token);

    expect(payload['sid']).toBeUndefined();
    expect(payload['role']).toBeUndefined();
  });

  it('expira exactamente segun el TTL configurado', async () => {
    const token = await provider.issue();
    const payload = decodeJwt(token);

    expect(payload.exp).toBeDefined();
    expect(payload.iat).toBeDefined();
    expect((payload.exp as number) - (payload.iat as number)).toBe(60);
    expect(Math.abs((payload.iat as number) - Math.floor(Date.now() / 1000))).toBeLessThanOrEqual(5);
  });

  it('obtiene un jti distinto en cada emision', async () => {
    const first = decodeJwt(await provider.issue());
    const second = decodeJwt(await provider.issue());

    expect(first.jti).toBeDefined();
    expect(second.jti).toBeDefined();
    expect(first.jti).not.toBe(second.jti);
  });

  it('toma issuer, audience y scope de la configuracion, no del codigo', async () => {
    const custom = createTestGatewayConfig({
      GATEWAY_SERVICE_ISSUER: 'otro-emisor',
      GATEWAY_SERVICE_AUDIENCE: 'destino-otro',
      GATEWAY_SERVICE_SCOPE: 'otro:ambito',
      GATEWAY_SERVICE_KID: 'kid-otro',
    });
    const token = await new ServiceTokenProvider(custom.config).issue();
    const payload = decodeJwt(token);

    expect(payload.iss).toBe('otro-emisor');
    expect(payload.aud).toBe('destino-otro');
    expect(payload.scope).toBe('otro:ambito');
    expect(decodeProtectedHeader(token).kid).toBe('kid-otro');
  });

  it('falla ruidosamente si la clave privada no es utilizable', async () => {
    const broken = createTestGatewayConfig();
    const providerBroken = new ServiceTokenProvider({
      ...broken.config,
      serviceJwt: { ...broken.config.serviceJwt, privateKey: 'no-es-una-clave' },
    });

    await expect(providerBroken.issue()).rejects.toBeDefined();
  });

  it('impide reutilizar un token de servicio como credencial de usuario', async () => {
    const token = await provider.issue();
    const payload = decodeJwt(token);

    expect(payload.iss).not.toBe('https://auth.stayhub.internal');
    expect(payload.aud).not.toBe('stayhub-api');
    expect(payload.sub).toBe('api-gateway');
  });
});
