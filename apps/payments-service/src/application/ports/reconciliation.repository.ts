export type ReconciliationClaim =
  | { readonly kind: 'payment'; readonly id: string; readonly gatewayReference: string; readonly attempts: number }
  | { readonly kind: 'refund'; readonly id: string; readonly paymentId: string; readonly gatewayReference: string; readonly attempts: number };

export interface ReconciliationRepository {
  claimDueBatch(limit: number, leaseMs: number): Promise<readonly ReconciliationClaim[]>;
  oldestPendingAgeSeconds(): Promise<number>;
}
