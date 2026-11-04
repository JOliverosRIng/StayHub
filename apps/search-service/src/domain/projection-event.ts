export type ProjectionOutcome = 'APPLIED' | 'IGNORED_STALE' | 'REMOVED';
export interface ProcessedProjectionEvent { readonly eventId: string; readonly eventType: string; readonly accommodationId: string; readonly projectionVersion: bigint; readonly payloadHash: string; readonly outcome: ProjectionOutcome; readonly processedAt: Date; }
