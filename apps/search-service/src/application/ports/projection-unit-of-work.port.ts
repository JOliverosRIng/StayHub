import type { ProjectionOutcome } from '@search/domain/projection-event';
export const PROJECTION_UNIT_OF_WORK_PORT = Symbol('PROJECTION_UNIT_OF_WORK_PORT');
export interface ProjectionMutation { readonly eventId: string; readonly eventType: string; readonly accommodationId: string; readonly projectionVersion: bigint; readonly payloadHash: string; }
export interface ProjectionUnitOfWorkPort { apply(mutation: ProjectionMutation): Promise<ProjectionOutcome>; }
