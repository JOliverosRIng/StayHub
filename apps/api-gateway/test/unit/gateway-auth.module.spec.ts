import { UnauthorizedException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import type { Request } from 'express';

import { JWT_VERIFIER } from '@gateway/application/ports/jwt-verifier.port';
import { JwtVerifierService } from '@gateway/infrastructure/security/jwt-verifier.service';
import { GatewayAuthModule } from '@gateway/modules/auth/gateway-auth.module';
import { GatewayJwtStrategy, USER_JWT_STRATEGY } from '@gateway/modules/auth/jwt.strategy';

import { createTestGatewayConfig } from '../support/gateway-config-fixture';

const { config } = createTestGatewayConfig();

const asRequest = (authorization?: string): Request =>
  ({
    header: (name: string): string | undefined =>
      name.toLowerCase() === 'authorization' ? authorization : undefined,
  }) as unknown as Request;

describe('GatewayJwtStrategy (GW-016)', () => {
  const strategy = new GatewayJwtStrategy(new JwtVerifierService(config));
  const bearerFor = (token: string): string => `Bearer ${token}`;

  it('esta registrada con su nombre de estrategia', () => {
    expect(USER_JWT_STRATEGY).toBe('gateway-access-jwt');
  });

  it('rechaza una peticion sin cabecera Authorization', async () => {
    await expect(strategy.validate(asRequest())).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('rechaza un esquema que no sea Bearer', async () => {
    for (const header of ['Basic dXNlcjpwYXNz', 'bearer', 'Bearer', 'Token abc']) {
      await expect(strategy.validate(asRequest(header))).rejects.toBeInstanceOf(
        UnauthorizedException,
      );
    }
  });

  it('rechaza un token invalido con UnauthorizedException, no con un error interno', async () => {
    await expect(strategy.validate(asRequest(bearerFor('no-es-un-jwt')))).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });

  it('no filtra el motivo del rechazo al cliente', async () => {
    const rejection = await strategy
      .validate(asRequest(bearerFor('no-es-un-jwt')))
      .catch((e: unknown) => e);

    expect(rejection).toBeInstanceOf(UnauthorizedException);
    expect((rejection as UnauthorizedException).message).toBe('Access token is invalid');
    expect((rejection as UnauthorizedException).getResponse()).toEqual({
      statusCode: 401,
      message: 'Access token is invalid',
      error: 'Unauthorized',
    });
  });
});

describe('GatewayAuthModule (GW-016)', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  it('resuelve la estrategia y el verificador a traves del port', async () => {
    const { env } = createTestGatewayConfig();
    Object.assign(process.env, env);

    const moduleRef = await Test.createTestingModule({
      imports: [GatewayAuthModule],
    }).compile();

    expect(moduleRef.get(JWT_VERIFIER)).toBeInstanceOf(JwtVerifierService);
    expect(moduleRef.get(GatewayJwtStrategy)).toBeInstanceOf(GatewayJwtStrategy);

    await moduleRef.close();
  });

  it('la estrategia resuelta desde el contenedor valida peticiones', async () => {
    const { env } = createTestGatewayConfig();
    Object.assign(process.env, env);

    const moduleRef = await Test.createTestingModule({
      imports: [GatewayAuthModule],
    }).compile();
    const strategy = moduleRef.get<GatewayJwtStrategy>(GatewayJwtStrategy);

    await expect(strategy.validate(asRequest())).rejects.toBeInstanceOf(UnauthorizedException);

    await moduleRef.close();
  });
});
