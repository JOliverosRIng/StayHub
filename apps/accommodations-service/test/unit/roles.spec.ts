import { UnauthorizedException, type ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { randomUUID } from 'node:crypto';
import { RolesGuard } from '../../src/interfaces/http/guards/roles.guard';
import { Roles, ROLES_METADATA } from '../../src/interfaces/http/guards/roles.decorator';
import { DomainError } from '../../src/domain/shared/domain-error';
import type { Principal, Role } from '../../src/domain/properties/property.types';

class Handlers {
  @Roles('OWNER') ownerOnly(): void { return undefined; }
  open(): void { return undefined; }
}

function context(handler: keyof Handlers, principal?: Principal): ExecutionContext {
  return {
    getHandler: () => Handlers.prototype[handler],
    getClass: () => Handlers,
    switchToHttp: () => ({ getRequest: () => ({ principal }) }),
  } as unknown as ExecutionContext;
}

describe('ACC-013 roles guard and decorator', () => {
  const guard = new RolesGuard(new Reflector());

  it('stores the required roles as metadata', () => {
    expect(new Reflector().get<unknown>(ROLES_METADATA, context('ownerOnly').getHandler())).toEqual(['OWNER']);
  });

  it('allows OWNER on an OWNER-only handler', () => {
    expect(guard.canActivate(context('ownerOnly', { sub: randomUUID(), role: 'OWNER' }))).toBe(true);
  });

  it.each(['GUEST', 'ADMIN'] as Role[])('denies %s with FORBIDDEN', (role) => {
    expect(() => guard.canActivate(context('ownerOnly', { sub: randomUUID(), role }))).toThrow(expect.objectContaining({ code: 'FORBIDDEN' }) as DomainError);
  });

  it('requires an authenticated principal', () => {
    expect(() => guard.canActivate(context('ownerOnly'))).toThrow(UnauthorizedException);
    expect(() => guard.canActivate(context('open'))).toThrow(UnauthorizedException);
  });

  it('allows any authenticated role when the handler declares no roles', () => {
    expect(guard.canActivate(context('open', { sub: randomUUID(), role: 'GUEST' }))).toBe(true);
  });
});
