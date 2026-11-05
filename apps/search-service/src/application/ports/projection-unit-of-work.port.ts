import type { ProjectionOutcome } from "@search/domain/projection-event";
import type { AvailabilityWindow } from "@search/domain/availability-window";
import type { SearchDocument } from "@search/domain/projection";
export const PROJECTION_UNIT_OF_WORK_PORT = Symbol(
  "PROJECTION_UNIT_OF_WORK_PORT",
);

export interface ProjectionMutation {
  readonly eventId: string;
  readonly eventType: string;
  readonly accommodationId: string;
  readonly projectionVersion: bigint;
  readonly payloadHash: string;
}
export interface UpsertProjectionMutation extends ProjectionMutation {
  readonly kind: "UPSERT";
  readonly document: SearchDocument;
  readonly availability: readonly AvailabilityWindow[];
}
export interface RemoveProjectionMutation extends ProjectionMutation {
  readonly kind: "REMOVE";
}
export type ProjectionCommand =
  | UpsertProjectionMutation
  | RemoveProjectionMutation;
export interface ProjectionUnitOfWorkPort {
  apply(mutation: ProjectionCommand): Promise<ProjectionOutcome>;
}
