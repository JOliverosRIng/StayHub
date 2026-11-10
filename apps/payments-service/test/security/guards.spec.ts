import { generateKeyPairSync } from 'node:crypto';
import { sign } from 'jsonwebtoken';
import { ForbiddenException, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ServiceAuthGuard, ServiceScope } from '../../src/interfaces/http/guards/service-auth.guard';
import { Roles, RolesGuard } from '../../src/interfaces/http/guards/roles.guard';
import type { PaymentsConfig } from '../../src/infrastructure/config/payments-config';

const keys = generateKeyPairSync('rsa', { modulusLength: 2048 });
const publicKey = keys.publicKey.export({ type: 'spki', format: 'pem' }).toString();
const jwtConfig = { issuer: 'stayhub', audience: 'payments', kid: 'test-v1', publicKey };
const now = Math.floor(Date.now() / 1000);
const paymentsConfig = {
  serviceJwt: jwtConfig,
  chargeScope: 'payments:charge',
  refundScope: 'payments:refund',
  readScope: 'payments:read',
} as PaymentsConfig;

function token(scope: string): string {
  return sign({ iss: jwtConfig.issuer, aud: jwtConfig.audience, sub: 'booking-service', scope, iat: now, exp: now + 120 }, keys.privateKey, {
    algorithm: 'RS256', keyid: jwtConfig.kid,
  });
}

describe('ServiceAuthGuard', () => {
  it('allows the exact configured service scope for a route', () => {
    const guard = new ServiceAuthGuard(paymentsConfig, { getAllAndOverride: () => 'charge' } as unknown as Reflector);
    const context = {
      switchToHttp: (): { getRequest: () => object } => ({ getRequest: (): object => ({ headers: { authorization: `Bearer ${token('payments:charge')}` }, rawHeaders: ['authorization', `Bearer ${token('payments:charge')}`] }) }),
      getHandler: () => ({}), getClass: () => ({}),
    } as unknown as Parameters<ServiceAuthGuard['canActivate']>[0];
    expect(guard.canActivate(context)).toBe(true);
  });

  it('rejects another route scope and a multi-scope token', () => {
    const guard = new ServiceAuthGuard(paymentsConfig, { getAllAndOverride: () => 'charge' } as unknown as Reflector);
    const makeContext = (scope: string): Parameters<ServiceAuthGuard['canActivate']>[0] => ({
      switchToHttp: (): { getRequest: () => object } => ({ getRequest: (): object => ({ headers: { authorization: `Bearer ${token(scope)}` }, rawHeaders: ['authorization', `Bearer ${token(scope)}`] }) }),
      getHandler: () => ({}), getClass: () => ({}),
    }) as unknown as Parameters<ServiceAuthGuard['canActivate']>[0];
    expect(() => guard.canActivate(makeContext('payments:refund'))).toThrow(ForbiddenException);
    expect(() => guard.canActivate(makeContext('payments:charge payments:refund'))).toThrow(ForbiddenException);
  });

  it('returns 401 when the bearer token is absent or malformed', () => {
    const guard = new ServiceAuthGuard(paymentsConfig, { getAllAndOverride: () => 'charge' } as unknown as Reflector);
    const context = {
      switchToHttp: (): { getRequest: () => object } => ({ getRequest: (): object => ({ headers: {}, rawHeaders: [] }) }),
      getHandler: () => ({}), getClass: () => ({}),
    } as unknown as Parameters<ServiceAuthGuard['canActivate']>[0];
    expect(() => guard.canActivate(context)).toThrow(UnauthorizedException);
  });
});

describe('RolesGuard', () => {
  it('allows an authenticated user with an allowed role', () => {
    const guard = new RolesGuard({ getAllAndOverride: () => ['OWNER'] } as unknown as Reflector);
    const context = {
      switchToHttp: (): { getRequest: () => object } => ({ getRequest: (): object => ({ user: { sub: 'user', role: 'OWNER' } }) }),
      getHandler: () => ({}), getClass: () => ({}),
    } as unknown as Parameters<RolesGuard['canActivate']>[0];
    expect(guard.canActivate(context)).toBe(true);
  });

  it('returns 401 without a principal and 403 for a disallowed role', () => {
    const guard = new RolesGuard({ getAllAndOverride: () => ['OWNER'] } as unknown as Reflector);
    const makeContext = (user?: unknown): Parameters<RolesGuard['canActivate']>[0] => ({
      switchToHttp: (): { getRequest: () => object } => ({ getRequest: (): object => ({ user }) }),
      getHandler: () => ({}), getClass: () => ({}),
    }) as unknown as Parameters<RolesGuard['canActivate']>[0];
    expect(() => guard.canActivate(makeContext())).toThrow(UnauthorizedException);
    expect(() => guard.canActivate(makeContext({ sub: 'user', role: 'GUEST' }))).toThrow(ForbiddenException);
  });

  it('provides the role metadata decorator', () => {
    class TestController { protected readonly unused = true; }
    const decorator = Roles('OWNER', 'ADMIN');
    decorator(TestController);
    expect(Reflect.getMetadata('payments:roles', TestController)).toEqual(['OWNER', 'ADMIN']);
    expect(ServiceScope('charge')).toBeDefined();
  });
});
