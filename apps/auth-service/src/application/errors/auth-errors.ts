export abstract class ApplicationError extends Error {
  protected constructor(
    public readonly code: string,
    message: string,
    public readonly safeDetail: string,
  ) {
    super(message);
    this.name = new.target.name;
  }
}

export class InvalidCredentialsError extends ApplicationError {
  public constructor() {
    super('INVALID_CREDENTIALS', 'Authentication failed', 'Invalid credentials');
  }
}

export class IdempotencyConflictError extends ApplicationError {
  public constructor() {
    super('IDEMPOTENCY_CONFLICT', 'Idempotency key reused', 'The request conflicts with a previous request');
  }
}

export class SessionInvalidError extends ApplicationError {
  public constructor() {
    super('SESSION_INVALID', 'Session is not active', 'Authentication is required');
  }
}

export class RefreshTokenInvalidError extends ApplicationError {
  public constructor() {
    super('REFRESH_TOKEN_INVALID', 'Refresh token rejected', 'Authentication is required');
  }
}

export class DependencyUnavailableError extends ApplicationError {
  public constructor(dependency: string) {
    super('DEPENDENCY_UNAVAILABLE', `${dependency} is unavailable`, 'A required dependency is unavailable');
  }
}

export class LoginRateLimitError extends ApplicationError {
  public constructor(public readonly retryAfterSeconds: number) {
    super('LOGIN_RATE_LIMITED', 'Login failure limit exceeded', 'Too many authentication attempts');
  }
}

