import type { UserRole } from './users-service.port';

export const REGISTER_ACCOUNT_USE_CASE = Symbol('REGISTER_ACCOUNT_USE_CASE');
export const LOGIN_USE_CASE = Symbol('LOGIN_USE_CASE');
export const ROTATE_REFRESH_TOKEN_USE_CASE = Symbol('ROTATE_REFRESH_TOKEN_USE_CASE');
export const VALIDATE_SESSION_USE_CASE = Symbol('VALIDATE_SESSION_USE_CASE');

export type RegistrationRole = Exclude<UserRole, 'ADMIN'>;

export interface RegisterAccountInput {
  readonly name: string;
  readonly email: string;
  readonly password: string;
  readonly role: RegistrationRole;
}

export interface RegisterAccountCommand {
  readonly idempotencyKey: string;
  readonly input: RegisterAccountInput;
  readonly traceId: string;
}

export interface RegisterAccountResult {
  readonly id: string;
  readonly name: string;
  readonly email: string;
  readonly role: RegistrationRole;
}

export interface RegisterAccountUseCase {
  execute(command: RegisterAccountCommand): Promise<RegisterAccountResult>;
}

export interface LoginCommand {
  readonly email: string;
  readonly password: string;
  readonly traceId: string;
}

export interface AuthenticatedPrincipal {
  readonly userId: string;
  readonly sessionId: string;
  readonly role: UserRole;
}

export interface IssuedTokenPair {
  readonly accessToken: string;
  readonly refreshToken: string;
  readonly expiresIn: 3600;
  readonly absoluteExpiresAt: Date;
  readonly principal: AuthenticatedPrincipal;
}

export interface LoginUseCase {
  execute(command: LoginCommand): Promise<IssuedTokenPair>;
}

export interface RotateRefreshCommand {
  readonly refreshToken: string;
  readonly traceId: string;
}

export interface RotateRefreshTokenUseCase {
  execute(command: RotateRefreshCommand): Promise<IssuedTokenPair>;
}

export interface ValidateSessionCommand {
  readonly sessionId: string;
  readonly userId: string;
  readonly accessTokenExpiresAt?: Date;
  readonly traceId: string;
}

export interface ValidatedSession {
  readonly active: true;
  readonly role: UserRole;
}

export interface ValidateSessionUseCase {
  execute(command: ValidateSessionCommand): Promise<ValidatedSession>;
}
