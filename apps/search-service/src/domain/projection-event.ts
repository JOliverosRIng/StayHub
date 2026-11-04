export type ProjectionOutcome = "APPLIED" | "IGNORED_STALE" | "REMOVED";
export const UPSERTED_PROJECTION_EVENT = "accommodation.search.v1.upserted";
export const REMOVED_PROJECTION_EVENT = "accommodation.search.v1.removed";

export interface AvailabilityWindowEvent {
  readonly startDate: string;
  readonly endDate: string;
  readonly availableCapacity: number;
}

export interface UpsertProjectionData {
  readonly published: boolean;
  readonly name: string;
  readonly description: string;
  readonly countryCode: string;
  readonly region?: string | null;
  readonly city: string;
  readonly addressSummary?: string | null;
  readonly latitude?: number | null;
  readonly longitude?: number | null;
  readonly minNightlyPrice: number;
  readonly currency: string;
  readonly capacity: number;
  readonly amenities: readonly string[];
  readonly keywords: readonly string[];
  readonly primaryPhotoUrl?: string | null;
  readonly availability: readonly AvailabilityWindowEvent[];
  readonly sourceUpdatedAt: string;
}

interface ProjectionEventBase {
  readonly eventId: string;
  readonly schemaVersion: 1;
  readonly occurredAt: string;
  readonly accommodationId: string;
  readonly projectionVersion: number;
}

export interface UpsertedProjectionEvent extends ProjectionEventBase {
  readonly eventType: typeof UPSERTED_PROJECTION_EVENT;
  readonly data: UpsertProjectionData;
}

export interface RemovedProjectionEvent extends ProjectionEventBase {
  readonly eventType: typeof REMOVED_PROJECTION_EVENT;
}

export type ProjectionEvent =
  | UpsertedProjectionEvent
  | RemovedProjectionEvent;

export interface ProcessedProjectionEvent {
  readonly eventId: string;
  readonly eventType: string;
  readonly accommodationId: string;
  readonly projectionVersion: bigint;
  readonly payloadHash: string;
  readonly outcome: ProjectionOutcome;
  readonly processedAt: Date;
}
