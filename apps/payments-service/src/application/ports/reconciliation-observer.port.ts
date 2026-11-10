import type { ReconciliationClaim } from './reconciliation.repository';

export interface ReconciliationObserverPort {
  resolved(record: {
    readonly kind: ReconciliationClaim['kind'];
    readonly outcome: string;
    readonly attempts: number;
    readonly durationMs: number;
  }): void;
}
