export interface AvailabilityWindow {
  readonly id: string;
  readonly accommodationId: string;
  readonly startDate: string;
  readonly endDate: string;
  readonly availableCapacity: number;
  readonly projectionVersion: bigint;
}

export function assertAvailabilityWindow(window: AvailabilityWindow): void {
  if (window.endDate <= window.startDate)
    throw new Error("endDate must be greater than startDate");
  if (
    !Number.isSafeInteger(window.availableCapacity) ||
    window.availableCapacity <= 0
  )
    throw new Error("availableCapacity must be greater than zero");
  if (window.projectionVersion <= 0n)
    throw new Error("projectionVersion must be positive");
}
