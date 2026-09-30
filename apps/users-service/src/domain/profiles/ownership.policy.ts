import { DomainError } from '../shared/domain-error';
export function assertOwner(subject: string, target: string): void { if (subject !== target) throw new DomainError('FORBIDDEN'); }
