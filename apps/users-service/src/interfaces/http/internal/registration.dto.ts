import { Allow } from 'class-validator';
import { invalid } from '@users/domain/shared/domain-error';
export class PendingUserDto {
  @Allow() registrationId!: string;
  @Allow() userId!: string;
  @Allow() name!: string;
  @Allow() email!: string;
  @Allow() role!: 'GUEST' | 'OWNER';
}
export function emptyCommand(body: unknown): void {
  if (body !== undefined && (body === null || typeof body !== 'object' || Array.isArray(body) || Object.keys(body).length)) invalid('body');
}
