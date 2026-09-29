export type HttpMethod = 'GET' | 'POST' | 'PATCH' | 'DELETE';

export interface UsersServiceRequest<TBody = never> {
  readonly method: HttpMethod;
  readonly path: string;
  readonly traceId: string;
  readonly body?: TBody;
  readonly idempotencyKey?: string;
  readonly idempotent: boolean;
}

export interface UsersServiceProblem {
  readonly type: string;
  readonly title: string;
  readonly status: number;
  readonly code: string;
  readonly traceId: string;
  readonly detail?: string;
}

export class UsersServiceHttpError extends Error {
  public constructor(
    public readonly status: number,
    public readonly problem: UsersServiceProblem | null,
  ) {
    super(`Users service returned ${status}`);
  }
}

export interface UsersServiceUserSummary {
  readonly id: string;
  readonly name: string;
  readonly email: string;
  readonly role: string;
  readonly status: string;
}

export interface UsersServicePendingUserBody {
  readonly registrationId: string;
  readonly userId: string;
  readonly name: string;
  readonly email: string;
  readonly role: string;
}

