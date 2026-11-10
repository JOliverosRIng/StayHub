import { ForbiddenException, type ExecutionContext } from '@nestjs/common';
import { NotificationOwnershipGuard } from '../../src/interfaces/http/guards/notification-ownership.guard';

describe('notification ownership guard (NTF-006)', () => {
  const context = (user: unknown, id: string): ExecutionContext => ({
    switchToHttp: () => ({ getRequest: () => ({ user, params: { id } }) }),
  } as unknown as ExecutionContext);
  const guard = new NotificationOwnershipGuard();
  it('allows owner and ADMIN access JWTs', () => {
    expect(guard.canActivate(context({ sub: 'u1', roles: [], tokenType: 'access' }, 'u1'))).toBe(true);
    expect(guard.canActivate(context({ sub: 'a1', roles: ['ADMIN'], tokenType: 'access' }, 'u2'))).toBe(true);
  });
  it('rejects another user and all service JWTs', () => {
    expect(() => guard.canActivate(context({ sub: 'u1', roles: [], tokenType: 'access' }, 'u2'))).toThrow(ForbiddenException);
    expect(() => guard.canActivate(context({ sub: 'service', roles: ['ADMIN'], tokenType: 'service' }, 'u1'))).toThrow(ForbiddenException);
  });
});
