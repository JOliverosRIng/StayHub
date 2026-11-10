import { ForbiddenException, type ExecutionContext } from '@nestjs/common';
import { SendAuthGuard } from '../../src/interfaces/http/guards/send-auth.guard';
import type { JwtVerifier } from '../../src/infrastructure/security/jwt.verifier';

describe('send notification authorization (NTF-009)', () => {
  it('denies non-admin access JWT before controller or repository work', () => {
    const verifyService = jest.fn();
    const verifier = { verifyAccess: () => ({ sub: 'u1', roles: ['USER'], tokenType: 'access' as const }), verifyService } as unknown as JwtVerifier;
    const guard = new SendAuthGuard(verifier);
    const context = {
      switchToHttp: (): { getRequest: () => { header: (name: string) => string } } => ({ getRequest: () => ({ header: () => 'Bearer access-token' }) }),
    } as unknown as ExecutionContext;
    expect(() => guard.canActivate(context)).toThrow(ForbiddenException);
    expect(verifyService.mock.calls).toHaveLength(0);
  });
});
