import { UsersServiceAdapter } from '@auth/infrastructure/http/users-service.adapter';
import type { UsersLoginIdentityClient } from '@auth/infrastructure/http/users-login-identity.client';
import type { UsersRegistrationClient } from '@auth/infrastructure/http/users-registration.client';

const TRACE = 'trace-adapter-1234';

function build(): {
  readonly adapter: UsersServiceAdapter;
  readonly registration: {
    readonly createPendingUser: jest.Mock;
    readonly getRegistration: jest.Mock;
    readonly activateRegistration: jest.Mock;
    readonly cancelRegistration: jest.Mock;
  };
  readonly login: { readonly resolveLoginIdentity: jest.Mock };
} {
  const registration = {
    createPendingUser: jest.fn(() => Promise.resolve({})),
    getRegistration: jest.fn(() => Promise.resolve(null)),
    activateRegistration: jest.fn(() => Promise.resolve({})),
    cancelRegistration: jest.fn(() => Promise.resolve()),
  };
  const login = { resolveLoginIdentity: jest.fn(() => Promise.resolve(null)) };
  const adapter = new UsersServiceAdapter(
    registration as unknown as UsersRegistrationClient,
    login as unknown as UsersLoginIdentityClient,
  );
  return { adapter, registration, login };
}

describe('UsersServiceAdapter (AUTH-072)', () => {
  it('delegates registration operations to the AUTH-041 client', async (): Promise<void> => {
    const { adapter, registration } = build();
    const command = {
      registrationId: 'reg',
      userId: 'user',
      name: 'Jane',
      email: 'jane@example.test',
      role: 'GUEST' as const,
    };

    await adapter.createPendingUser(command, TRACE);
    await adapter.getRegistration('reg', TRACE);
    await adapter.activateRegistration('reg', TRACE);
    await adapter.cancelRegistration('reg', TRACE);

    expect(registration.createPendingUser).toHaveBeenCalledWith(command, TRACE);
    expect(registration.getRegistration).toHaveBeenCalledWith('reg', TRACE);
    expect(registration.activateRegistration).toHaveBeenCalledWith('reg', TRACE);
    expect(registration.cancelRegistration).toHaveBeenCalledWith('reg', TRACE);
  });

  it('delegates the login lookup to the AUTH-063 client', async (): Promise<void> => {
    const { adapter, login } = build();

    await adapter.resolveLoginIdentity('jane@example.test', TRACE);

    expect(login.resolveLoginIdentity).toHaveBeenCalledWith('jane@example.test', TRACE);
  });
});
