import { Injectable } from '@nestjs/common';

import type {
  LoginIdentity,
  PendingUserCommand,
  RegistrationIdentity,
  UsersServicePort,
} from '@auth/application/ports/users-service.port';
import { UsersLoginIdentityClient } from './users-login-identity.client';
import { UsersRegistrationClient } from './users-registration.client';

/**
 * Single `USERS_SERVICE` binding that delegates registration operations to the AUTH-041 adapter and the
 * login lookup to the AUTH-063 adapter. It holds no state of its own, so both clients keep their own
 * transport/circuit behaviour under the shared `UsersServiceClient`.
 */
@Injectable()
export class UsersServiceAdapter implements UsersServicePort {
  public constructor(
    private readonly registration: UsersRegistrationClient,
    private readonly login: UsersLoginIdentityClient,
  ) {}

  public createPendingUser(
    command: PendingUserCommand,
    traceId: string,
  ): Promise<RegistrationIdentity> {
    return this.registration.createPendingUser(command, traceId);
  }

  public getRegistration(
    registrationId: string,
    traceId: string,
  ): Promise<RegistrationIdentity | null> {
    return this.registration.getRegistration(registrationId, traceId);
  }

  public activateRegistration(
    registrationId: string,
    traceId: string,
  ): Promise<RegistrationIdentity> {
    return this.registration.activateRegistration(registrationId, traceId);
  }

  public cancelRegistration(registrationId: string, traceId: string): Promise<void> {
    return this.registration.cancelRegistration(registrationId, traceId);
  }

  public resolveLoginIdentity(
    normalizedEmail: string,
    traceId: string,
  ): Promise<LoginIdentity | null> {
    return this.login.resolveLoginIdentity(normalizedEmail, traceId);
  }
}
