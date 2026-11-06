import type { ProjectionUnitOfWorkPort } from "../ports/projection-unit-of-work.port";
import type {
  ProjectionOutcome,
  UpsertedProjectionEvent,
} from "@search/domain/projection-event";
import { toUpsertProjectionCommand } from "./projection.commands";

export class UpsertProjection {
  public constructor(private readonly unitOfWork: ProjectionUnitOfWorkPort) {}

  public execute(event: UpsertedProjectionEvent): Promise<ProjectionOutcome> {
    return this.unitOfWork.apply(toUpsertProjectionCommand(event));
  }
}
