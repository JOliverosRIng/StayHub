import { randomUUID } from "node:crypto";
import type {
  ProjectionMutation,
  RemoveProjectionMutation,
  UpsertProjectionMutation,
} from "../ports/projection-unit-of-work.port";
import { normalizeTerms } from "@search/domain/projection";
import { assertAvailabilityWindow } from "@search/domain/availability-window";
import type {
  ProjectionEvent,
  RemovedProjectionEvent,
  UpsertedProjectionEvent,
} from "@search/domain/projection-event";
import { projectionPayloadHash } from "./projection-payload-hash";

function base(event: ProjectionEvent): ProjectionMutation {
  return {
    eventId: event.eventId,
    eventType: event.eventType,
    accommodationId: event.accommodationId,
    projectionVersion: BigInt(event.projectionVersion),
    payloadHash: projectionPayloadHash(event),
  };
}

function nullableText(value: string | null | undefined): string | null {
  const normalized = value?.trim();
  return normalized ? normalized : null;
}

export function toUpsertProjectionCommand(
  event: UpsertedProjectionEvent,
): UpsertProjectionMutation {
  const projectionVersion = BigInt(event.projectionVersion);
  const name = event.data.name.trim();
  const city = event.data.city.trim();
  if (!name || !city) throw new Error("Projection name and city are required");
  const availability = event.data.availability.map((window) => {
    const normalized = {
      id: randomUUID(),
      accommodationId: event.accommodationId,
      startDate: window.startDate,
      endDate: window.endDate,
      availableCapacity: window.availableCapacity,
      projectionVersion,
    };
    assertAvailabilityWindow(normalized);
    return normalized;
  });
  return {
    ...base(event),
    kind: "UPSERT",
    document: {
      accommodationId: event.accommodationId,
      projectionVersion,
      published: event.data.published,
      name,
      description: event.data.description.trim(),
      countryCode: event.data.countryCode,
      region: nullableText(event.data.region),
      city,
      addressSummary: nullableText(event.data.addressSummary),
      location:
        event.data.latitude === undefined ||
        event.data.latitude === null ||
        event.data.longitude === undefined ||
        event.data.longitude === null
          ? null
          : {
              latitude: event.data.latitude,
              longitude: event.data.longitude,
            },
      minNightlyPrice: event.data.minNightlyPrice,
      currency: event.data.currency,
      capacity: event.data.capacity,
      amenities: normalizeTerms(event.data.amenities),
      keywords: normalizeTerms(event.data.keywords),
      primaryPhotoUrl: event.data.primaryPhotoUrl ?? null,
      sourceUpdatedAt: new Date(event.data.sourceUpdatedAt),
      indexedAt: new Date(),
    },
    availability,
  };
}

export function toRemoveProjectionCommand(
  event: RemovedProjectionEvent,
): RemoveProjectionMutation {
  return { ...base(event), kind: "REMOVE" };
}
