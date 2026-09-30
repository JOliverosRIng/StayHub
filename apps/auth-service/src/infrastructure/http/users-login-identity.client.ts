import { Injectable } from '@nestjs/common';

import { DependencyUnavailableError } from '@auth/application/errors/auth-errors';
import type { LoginIdentity, UserRole } from '@auth/application/ports/users-service.port';
import { UsersServiceClient } from './users-service.client';
import { UsersServiceHttpError } from './users-service.types';

const LOGIN_IDENTITY_PATH = '/internal/v1/login-identities/resolve';
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ROLES: readonly string[] = ['GUEST', 'OWNER', 'ADMIN'];

interface ResolveLoginIdentityBody {
  readonly email: string;
}

@Injectable()
export class UsersLoginIdentityClient {
  public constructor(private readonly client: UsersServiceClient) {}

  public async resolveLoginIdentity(
    normalizedEmail: string,
    traceId: string,
  ): Promise<LoginIdentity | null> {
    try {
      const response = await this.client.request<unknown, ResolveLoginIdentityBody>({
        method: 'POST',
        path: LOGIN_IDENTITY_PATH,
        traceId,
        body: { email: normalizedEmail.trim().toLowerCase() },
        idempotent: true,
      });
      return parseLoginIdentity(response);
    } catch (error) {
      if (error instanceof UsersServiceHttpError && error.status === 404) return null;
      throw new DependencyUnavailableError('users');
    }
  }
}

function parseLoginIdentity(value: unknown): LoginIdentity {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new DependencyUnavailableError('users');
  }
  const record = value as Record<string, unknown>;
  const userId = record.userId;
  const role = record.role;
  const status = record.status;

  if (typeof userId !== 'string' || !UUID_PATTERN.test(userId)) {
    throw new DependencyUnavailableError('users');
  }
  if (typeof role !== 'string' || !ROLES.includes(role)) {
    throw new DependencyUnavailableError('users');
  }
  if (status !== 'ACTIVE') {
    throw new DependencyUnavailableError('users');
  }
  return { userId, role: role as UserRole, status: 'ACTIVE' };
}
