import { DomainError } from '../shared/domain-error';
export function assertReplay(existing: { id: string; name: string; emailNormalized: string; role: string }, command: { userId: string; name: string; email: string; role: string }): void {
  if (existing.id !== command.userId || existing.name !== command.name || existing.emailNormalized !== command.email.toLowerCase() || existing.role !== command.role) throw new DomainError('IDEMPOTENCY_CONFLICT');
}
