import { ForbiddenException, UnauthorizedException, type ExecutionContext } from '@nestjs/common';
import { AccessJwtGuard } from '../../src/interfaces/http/guards/access-jwt.guard';
import { NotificationOwnershipGuard } from '../../src/interfaces/http/guards/notification-ownership.guard';
import type { JwtVerifier } from '../../src/infrastructure/security/jwt.verifier';

describe('notification read authorization (NTF-012)', () => {
  it('restricts reads to owner or ADMIN access tokens', () => {
    const guard = new NotificationOwnershipGuard();
    const context = (tokenType: 'access' | 'service', sub: string, roles: string[]): ExecutionContext => ({
      switchToHttp: (): { getRequest: () => { user: { tokenType: 'access' | 'service'; sub: string; roles: string[] }; params: { id: string } } } => ({ getRequest: () => ({ user: { tokenType, sub, roles }, params: { id: 'u1' } }) }),
    } as unknown as ExecutionContext);
    expect(guard.canActivate(context('access', 'u1', ['USER']))).toBe(true);
    expect(guard.canActivate(context('access', 'admin', ['ADMIN']))).toBe(true);
    expect(() => guard.canActivate(context('access', 'u2', ['USER']))).toThrow(ForbiddenException);
    expect(() => guard.canActivate(context('service', 'u1', ['ADMIN']))).toThrow(ForbiddenException);
  });

  it('rejects service credentials at the access verifier', () => {
    const verifyAccess = jest.fn(() => { throw new UnauthorizedException(); });
    const verifier = { verifyAccess } as unknown as JwtVerifier;
    const guard = new AccessJwtGuard(verifier);
    const context = { switchToHttp: (): { getRequest: () => { header: (name: string) => string } } => ({ getRequest: () => ({ header: () => 'Bearer service-token' }) }) } as unknown as ExecutionContext;
    expect(() => guard.canActivate(context)).toThrow(UnauthorizedException);
    expect(verifyAccess.mock.calls).toHaveLength(1);
  });
});
