import 'reflect-metadata';
import { randomUUID } from 'node:crypto';

import {
  ForbiddenException,
  UnauthorizedException,
  type ExecutionContext,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import { SignJWT, importPKCS8 } from 'jose';

import type { AccessTokenVerifier } from '@gateway/application/ports/jwt-verifier.port';
import { GatewayDependencyError } from '@gateway/application/errors/gateway-errors';
import type { GatewayConfig } from '@gateway/infrastructure/config/gateway-config';
import { JwtVerifierService } from '@gateway/infrastructure/security/jwt-verifier.service';
import type { HttpFetch, ServiceTokenIssuer } from '@gateway/infrastructure/http/service-client.base';
import { GatewayJwtStrategy } from '@gateway/modules/auth/jwt.strategy';

import { createTestGatewayConfig } from '../support/gateway-config-fixture';

/**
 * GW-033 — Seguridad de los guards de autenticación/autorización (FR-009–FR-013, SC-003).
 *
 * Test-first: la introspección de sesión se implementa en GW-039 y los guards (Access/Roles) en
 * GW-040. Esas piezas se cargan por import dinámico con especificador variable, de modo que
 * TypeScript/ESLint permanecen verdes y el fallo ocurre en tiempo de ejecución con "Cannot find
 * module …" — es decir, por lógica ausente, no por configuración del harness.
 *
 * La capa de autenticación JWT RS256 (GW-016) ya existe y se reutiliza: las aserciones de 401
 * puro (token inválido/ausente/vencido) se apoyan en `GatewayJwtStrategy`, que es la base sobre
 * la que operan los guards de GW-040.
 */

const INTROSPECTION_MODULE = '../../src/modules/auth/session-introspection.service';
const ROLES_GUARD_MODULE = '../../src/modules/auth/roles.guard';
const ACCESS_GUARD_MODULE = '../../src/modules/auth/access.guard';

const SUBJECT = '33333333-3333-4333-8333-333333333333';

const { config, servicePrivateKeyPem } = createTestGatewayConfig();
const USER_JWT_KID = Object.keys(config.userJwt.publicKeys)[0] ?? 'stayhub-auth-2026-01';
const verifier: AccessTokenVerifier = new JwtVerifierService(config);
const strategy = new GatewayJwtStrategy(verifier);

interface AuthoritativeSession {
  readonly active: boolean;
  readonly role: string;
}

interface SessionIntrospection {
  introspect(principal: { userId: string; sessionId: string }): Promise<AuthoritativeSession>;
}

type SessionIntrospectionCtor = new (
  config: GatewayConfig,
  serviceToken: ServiceTokenIssuer,
  deps?: { fetch?: HttpFetch },
) => SessionIntrospection;

interface Guard {
  canActivate(context: ExecutionContext): boolean | Promise<boolean>;
}

type RolesGuardCtor = new (reflector: Reflector) => Guard;
type AccessGuardCtor = new (
  verifier: AccessTokenVerifier,
  introspection: SessionIntrospection,
  reflector: Reflector,
) => Guard;

async function loadIntrospection(): Promise<SessionIntrospectionCtor> {
  const specifier: string = INTROSPECTION_MODULE;
  const module = (await import(specifier)) as { SessionIntrospectionService?: SessionIntrospectionCtor };
  if (module.SessionIntrospectionService === undefined) {
    throw new Error('GW-039 pendiente: SessionIntrospectionService no exporta la clase esperada');
  }
  return module.SessionIntrospectionService;
}

async function loadRolesGuard(): Promise<{ ctor: RolesGuardCtor; rolesKey: string }> {
  const specifier: string = ROLES_GUARD_MODULE;
  const module = (await import(specifier)) as { RolesGuard?: RolesGuardCtor; ROLES_KEY?: string };
  if (module.RolesGuard === undefined || module.ROLES_KEY === undefined) {
    throw new Error('GW-040 pendiente: RolesGuard/ROLES_KEY no exportados');
  }
  return { ctor: module.RolesGuard, rolesKey: module.ROLES_KEY };
}

async function loadAccessGuard(): Promise<AccessGuardCtor> {
  const specifier: string = ACCESS_GUARD_MODULE;
  const module = (await import(specifier)) as { AccessGuard?: AccessGuardCtor };
  if (module.AccessGuard === undefined) {
    throw new Error('GW-040 pendiente: AccessGuard no exporta la clase esperada');
  }
  return module.AccessGuard;
}

async function mintJwt(overrides: { role?: string; sid?: string; expOffset?: number } = {}): Promise<string> {
  const key = await importPKCS8(servicePrivateKeyPem, 'RS256');
  const now = Math.floor(Date.now() / 1000);
  const expOffset = overrides.expOffset ?? 3600;
  return new SignJWT({ role: overrides.role ?? 'GUEST', sid: overrides.sid ?? randomUUID() })
    .setProtectedHeader({ alg: 'RS256', kid: USER_JWT_KID, typ: 'JWT' })
    .setSubject(SUBJECT)
    .setIssuer(config.userJwt.issuer)
    .setAudience(config.userJwt.audience)
    .setIssuedAt(now - 120)
    .setExpirationTime(now + expOffset)
    .setJti(randomUUID())
    .sign(key);
}

function requestWith(authorization?: string): Record<string, unknown> {
  const headers: Record<string, string> = authorization === undefined ? {} : { authorization };
  return {
    headers,
    header: (name: string): string | undefined => headers[name.toLowerCase()],
    user: undefined,
  };
}

function contextFor(
  request: Record<string, unknown>,
  handler: (...args: unknown[]) => unknown = (): void => {},
): ExecutionContext {
  const httpArgs = {
    getRequest: (): unknown => request,
    getResponse: (): unknown => ({}),
    getNext: (): unknown => ({}),
  };
  return {
    switchToHttp: (): typeof httpArgs => httpArgs,
    getHandler: (): typeof handler => handler,
    getClass: (): object => class GuardProbe {},
    getType: (): string => 'http',
    getArgs: (): unknown[] => [request],
    getArgByIndex: (): unknown => request,
    switchToRpc: (): unknown => ({}),
    switchToWs: (): unknown => ({}),
  } as unknown as ExecutionContext;
}

function fetchReturning(status: number, body: Record<string, unknown>): HttpFetch {
  return (): Promise<Response> =>
    Promise.resolve(
      new Response(JSON.stringify(body), {
        status,
        headers: { 'content-type': status >= 400 ? 'application/problem+json' : 'application/json' },
      }),
    );
}

function fetchThrowing(): HttpFetch {
  return (): Promise<Response> => Promise.reject(new Error('auth down'));
}

const tokenIssuer: ServiceTokenIssuer = { issue: (): Promise<string> => Promise.resolve('service-jwt') };

async function rejection(promise: Promise<unknown>): Promise<unknown> {
  return promise.then(
    () => {
      throw new Error('se esperaba un rechazo, pero la promesa resolvió');
    },
    (error: unknown) => error,
  );
}

describe('Guards de autenticación y autorización (GW-033)', () => {
  describe('Autenticación JWT RS256 (base de GW-016, reutilizada por los guards)', () => {
    it('rechaza con 401 una petición sin cabecera Authorization', async () => {
      await expect(strategy.validate(requestWith() as unknown as Request)).rejects.toBeInstanceOf(
        UnauthorizedException,
      );
    });

    it('rechaza con 401 un JWT inválido', async () => {
      await expect(
        strategy.validate(requestWith('Bearer no-es-un-jwt') as unknown as Request),
      ).rejects.toBeInstanceOf(UnauthorizedException);
    });

    it('rechaza con 401 un JWT vencido', async () => {
      const expired = await mintJwt({ expOffset: -60 });
      await expect(
        strategy.validate(requestWith(`Bearer ${expired}`) as unknown as Request),
      ).rejects.toBeInstanceOf(UnauthorizedException);
    });
  });

  describe('Introspección de sesión (GW-039)', () => {
    it('devuelve el rol autoritativo cuando la sesión está activa', async () => {
      const Introspection = await loadIntrospection();
      const service = new Introspection(config, tokenIssuer, {
        fetch: fetchReturning(200, { active: true, role: 'OWNER' }),
      });

      await expect(service.introspect({ userId: SUBJECT, sessionId: randomUUID() })).resolves.toEqual({
        active: true,
        role: 'OWNER',
      });
    });

    it('falla cerrado con GatewayDependencyError cuando Auth no responde', async () => {
      const Introspection = await loadIntrospection();
      const service = new Introspection(config, tokenIssuer, { fetch: fetchThrowing() });

      const error = await rejection(service.introspect({ userId: SUBJECT, sessionId: randomUUID() }));
      expect(error).toBeInstanceOf(GatewayDependencyError);
    });

    it('trata un 503 de Auth como fallo cerrado (GatewayDependencyError)', async () => {
      const Introspection = await loadIntrospection();
      const service = new Introspection(config, tokenIssuer, {
        fetch: fetchReturning(503, { code: 'AUTH_UNAVAILABLE' }),
      });

      const error = await rejection(service.introspect({ userId: SUBJECT, sessionId: randomUUID() }));
      expect(error).toBeInstanceOf(GatewayDependencyError);
    });
  });

  describe('RolesGuard (GW-040)', () => {
    it('permite cuando el rol del principal está en la lista requerida', async () => {
      const { ctor: RolesGuard, rolesKey } = await loadRolesGuard();
      const guard = new RolesGuard(new Reflector());
      const handler = (): void => {};
      Reflect.defineMetadata(rolesKey, ['OWNER'], handler);
      const request = { ...requestWith(), user: { role: 'OWNER' } };

      await expect(guard.canActivate(contextFor(request, handler))).resolves.toBe(true);
    });

    it('rechaza con 403 cuando el rol no está permitido para la operación', async () => {
      const { ctor: RolesGuard, rolesKey } = await loadRolesGuard();
      const guard = new RolesGuard(new Reflector());
      const handler = (): void => {};
      Reflect.defineMetadata(rolesKey, ['OWNER'], handler);
      const request = { ...requestWith(), user: { role: 'GUEST' } };

      const error = await rejection(Promise.resolve(guard.canActivate(contextFor(request, handler))));
      expect(error).toBeInstanceOf(ForbiddenException);
    });
  });

  describe('AccessGuard (GW-040): introspección, precedencia y fallo cerrado', () => {
    const activeIntrospection: SessionIntrospection = {
      introspect: (): Promise<AuthoritativeSession> => Promise.resolve({ active: true, role: 'GUEST' }),
    };

    it('concede acceso con JWT válido y sesión activa cuyo rol coincide', async () => {
      const AccessGuard = await loadAccessGuard();
      const guard = new AccessGuard(verifier, activeIntrospection, new Reflector());
      const request = requestWith(`Bearer ${await mintJwt({ role: 'GUEST' })}`);

      await expect(guard.canActivate(contextFor(request))).resolves.toBe(true);
    });

    it('precedencia 401 antes que 403: un JWT inválido se rechaza sin consultar la sesión', async () => {
      const AccessGuard = await loadAccessGuard();
      let introspected = 0;
      const introspection: SessionIntrospection = {
        introspect: (): Promise<AuthoritativeSession> => {
          introspected += 1;
          return Promise.resolve({ active: true, role: 'OWNER' });
        },
      };
      const guard = new AccessGuard(verifier, introspection, new Reflector());

      const error = await rejection(
        Promise.resolve(guard.canActivate(contextFor(requestWith('Bearer no-es-un-jwt')))),
      );
      expect(error).toBeInstanceOf(UnauthorizedException);
      expect(introspected).toBe(0);
    });

    it('rechaza cuando el rol del JWT no coincide con el rol autoritativo de la sesión', async () => {
      const AccessGuard = await loadAccessGuard();
      const authoritativeOwner: SessionIntrospection = {
        introspect: (): Promise<AuthoritativeSession> => Promise.resolve({ active: true, role: 'OWNER' }),
      };
      const guard = new AccessGuard(verifier, authoritativeOwner, new Reflector());
      const request = requestWith(`Bearer ${await mintJwt({ role: 'GUEST' })}`);

      await expect(
        rejection(Promise.resolve(guard.canActivate(contextFor(request)))),
      ).resolves.toBeInstanceOf(UnauthorizedException);
    });

    it('falla cerrado con 503 cuando la introspección de Auth no está disponible', async () => {
      const AccessGuard = await loadAccessGuard();
      const downIntrospection: SessionIntrospection = {
        introspect: (): Promise<AuthoritativeSession> =>
          Promise.reject(new GatewayDependencyError('auth')),
      };
      const guard = new AccessGuard(verifier, downIntrospection, new Reflector());
      const request = requestWith(`Bearer ${await mintJwt()}`);

      const error = await rejection(Promise.resolve(guard.canActivate(contextFor(request))));
      expect(error).toBeInstanceOf(GatewayDependencyError);
    });

    it('no autoriza (ni deja pasar al handler) cuando la sesión está inactiva', async () => {
      const AccessGuard = await loadAccessGuard();
      const inactive: SessionIntrospection = {
        introspect: (): Promise<AuthoritativeSession> => Promise.resolve({ active: false, role: 'GUEST' }),
      };
      const guard = new AccessGuard(verifier, inactive, new Reflector());
      const request = requestWith(`Bearer ${await mintJwt({ role: 'GUEST' })}`);

      const outcome = await Promise.resolve(guard.canActivate(contextFor(request))).then(
        (allowed) => ({ allowed }),
        (error: unknown) => ({ error }),
      );
      // Debe rechazar (throw) o negar (false); nunca conceder.
      expect('allowed' in outcome ? outcome.allowed : false).toBe(false);
    });
  });
});
