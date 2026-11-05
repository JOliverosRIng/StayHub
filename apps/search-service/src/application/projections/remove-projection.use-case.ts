import type { ProjectionUnitOfWorkPort } from "../ports/projection-unit-of-work.port";
import type {
  ProjectionOutcome,
  RemovedProjectionEvent,
} from "@search/domain/projection-event";
import { toRemoveProjectionCommand } from "./projection.commands";

export class RemoveProjection {
  public constructor(private readonly unitOfWork: ProjectionUnitOfWorkPort) {}

  public execute(event: RemovedProjectionEvent): Promise<ProjectionOutcome> {
    return this.unitOfWork.apply(toRemoveProjectionCommand(event));
  }
}
