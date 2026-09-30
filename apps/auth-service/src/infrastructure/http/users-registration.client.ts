import { Injectable } from '@nestjs/common';

import {
  DependencyUnavailableError,
  RegistrationCancelledError,
  RegistrationConflictError,
} from '@auth/application/errors/auth-errors';
import type {
  PendingUserCommand,
  RegistrationIdentity,
  UserRole,
} from '@auth/application/ports/users-service.port';
import { UsersServiceClient } from './users-service.client';
import {
  UsersServiceHttpError,
  type UsersServicePendingUserBody,
  type UsersServiceUserSummary,
} from './users-service.types';

const REGISTRATION_PATH = '/internal/v1/registrations';
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ROLES: readonly string[] = ['GUEST', 'OWNER', 'ADMIN'];
const STATUSES: readonly string[] = ['PENDING', 'ACTIVE', 'CANCELLED'];

type RegistrationStatus = 'PENDING' | 'ACTIVE' | 'CANCELLED';

@Injectable()
export class UsersRegistrationClient {
  public constructor(private readonly client: UsersServiceClient) {}

  public async createPendingUser(
    command: PendingUserCommand,
    traceId: string,
  ): Promise<RegistrationIdentity> {
    try {
      const summary = await this.client.request<UsersServiceUserSummary, UsersServicePendingUserBody>({
        method: 'POST',
        path: REGISTRATION_PATH,
        traceId,
        body: {
          registrationId: command.registrationId,
          userId: command.userId,
          name: command.name,
          email: command.email,
          role: command.role,
        },
        idempotencyKey: command.registrationId,
        idempotent: true,
      });
      return parseIdentity(summary, command.userId);
    } catch (error) {
      throw mapRegistrationError(error);
    }
  }

  public async getRegistration(
    registrationId: string,
    traceId: string,
  ): Promise<RegistrationIdentity | null> {
    try {
      const summary = await this.client.request<UsersServiceUserSummary>({
        method: 'GET',
        path: `${REGISTRATION_PATH}/${registrationId}`,
        traceId,
        idempotent: true,
      });
      return parseIdentity(summary);
    } catch (error) {
      if (error instanceof UsersServiceHttpError && error.status === 404) return null;
      throw mapRegistrationError(error);
    }
  }

  public async activateRegistration(
    registrationId: string,
    traceId: string,
  ): Promise<RegistrationIdentity> {
    try {
      const summary = await this.client.request<UsersServiceUserSummary>({
        method: 'POST',
        path: `${REGISTRATION_PATH}/${registrationId}/activate`,
        traceId,
        idempotent: true,
      });
      return parseIdentity(summary);
    } catch (error) {
      if (error instanceof UsersServiceHttpError && error.status === 409) {
        throw new RegistrationCancelledError();
      }
      throw mapRegistrationError(error);
    }
  }

  public async cancelRegistration(registrationId: string, traceId: string): Promise<void> {
    try {
      await this.client.request<void>({
        method: 'POST',
        path: `${REGISTRATION_PATH}/${registrationId}/cancel`,
        traceId,
        idempotent: true,
      });
    } catch (error) {
      if (error instanceof UsersServiceHttpError && error.status === 409) {
        throw new RegistrationConflictError();
      }
      throw mapRegistrationError(error);
    }
  }
}

function mapRegistrationError(error: unknown): Error {
  if (error instanceof UsersServiceHttpError && error.status === 409) {
    return new RegistrationConflictError();
  }
  return new DependencyUnavailableError('users');
}

function parseIdentity(value: unknown, expectedUserId?: string): RegistrationIdentity {
  if (typeof value !== 'object' || value === null) throw new DependencyUnavailableError('users');
  const record = value as Record<string, unknown>;
  const userId = record.id;
  const name = record.name;
  const email = record.email;
  const role = record.role;
  const status = record.status;

  if (typeof userId !== 'string' || !UUID_PATTERN.test(userId)) {
    throw new DependencyUnavailableError('users');
  }
  if (typeof name !== 'string' || name === '') throw new DependencyUnavailableError('users');
  if (typeof email !== 'string' || email === '') throw new DependencyUnavailableError('users');
  if (typeof role !== 'string' || !ROLES.includes(role)) {
    throw new DependencyUnavailableError('users');
  }
  if (typeof status !== 'string' || !STATUSES.includes(status)) {
    throw new DependencyUnavailableError('users');
  }
  if (expectedUserId !== undefined && userId !== expectedUserId) {
    throw new DependencyUnavailableError('users');
  }

  return {
    userId,
    name,
    email,
    role: role as UserRole,
    status: status as RegistrationStatus,
  };
}
