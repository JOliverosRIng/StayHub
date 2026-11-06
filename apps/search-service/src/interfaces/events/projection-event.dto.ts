import {
  REMOVED_PROJECTION_EVENT,
  UPSERTED_PROJECTION_EVENT,
  type AvailabilityWindowEvent,
  type ProjectionEvent,
  type RemovedProjectionEvent,
  type UpsertedProjectionEvent,
} from "@search/domain/projection-event";

export {
  REMOVED_PROJECTION_EVENT,
  UPSERTED_PROJECTION_EVENT,
  type AvailabilityWindowEvent as AvailabilityWindowDto,
  type ProjectionEvent as ProjectionEventDto,
  type RemovedProjectionEvent as RemovedProjectionEventDto,
  type UpsertedProjectionEvent as UpsertedProjectionEventDto,
};

export class ProjectionEventValidationError extends Error {
  public readonly code = "SEARCH_PROJECTION_EVENT_INVALID";
}

type JsonObject = Record<string, unknown>;
const uuid =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;
const date = /^\d{4}-\d{2}-\d{2}$/u;

function fail(field: string): never {
  throw new ProjectionEventValidationError(`Invalid projection field: ${field}`);
}

function object(value: unknown, field: string): JsonObject {
  if (!value || typeof value !== "object" || Array.isArray(value)) fail(field);
  return value as JsonObject;
}

function exactKeys(
  value: JsonObject,
  allowed: readonly string[],
  required: readonly string[],
  field: string,
): void {
  if (
    Object.keys(value).some((key) => !allowed.includes(key)) ||
    required.some((key) => !(key in value))
  )
    fail(field);
}

function text(
  value: unknown,
  field: string,
  minLength: number,
  maxLength: number,
): string {
  if (
    typeof value !== "string" ||
    value.length < minLength ||
    value.length > maxLength
  )
    fail(field);
  return value;
}

function nullableText(
  value: unknown,
  field: string,
  maxLength: number,
): void {
  if (value !== undefined && value !== null)
    text(value, field, 0, maxLength);
}

function finiteNumber(
  value: unknown,
  field: string,
  minimum: number,
  maximum = Number.MAX_VALUE,
): number {
  if (
    typeof value !== "number" ||
    !Number.isFinite(value) ||
    value < minimum ||
    value > maximum
  )
    fail(field);
  return value;
}

function integer(value: unknown, field: string, minimum: number): number {
  const result = finiteNumber(value, field, minimum);
  if (!Number.isSafeInteger(result)) fail(field);
  return result;
}

function dateTime(value: unknown, field: string): void {
  if (
    typeof value !== "string" ||
    !/^\d{4}-\d{2}-\d{2}T.+(?:Z|[+-]\d{2}:\d{2})$/iu.test(value) ||
    !Number.isFinite(Date.parse(value))
  )
    fail(field);
}

function calendarDate(value: unknown, field: string): string {
  if (typeof value !== "string" || !date.test(value)) fail(field);
  const parsed = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(parsed.valueOf()) || parsed.toISOString().slice(0, 10) !== value)
    fail(field);
  return value;
}

function stringArray(value: unknown, field: string): readonly string[] {
  if (!Array.isArray(value) || value.length > 100) fail(field);
  const result = value.map((item, index) =>
    text(item, `${field}.${index}`, 1, 60),
  );
  if (new Set(result).size !== result.length) fail(field);
  return result;
}

function availability(value: unknown): readonly AvailabilityWindowEvent[] {
  if (!Array.isArray(value) || value.length > 366) fail("data.availability");
  return value.map((item, index) => {
    const window = object(item, `data.availability.${index}`);
    exactKeys(
      window,
      ["startDate", "endDate", "availableCapacity"],
      ["startDate", "endDate", "availableCapacity"],
      `data.availability.${index}`,
    );
    return {
      startDate: calendarDate(
        window["startDate"],
        `data.availability.${index}.startDate`,
      ),
      endDate: calendarDate(
        window["endDate"],
        `data.availability.${index}.endDate`,
      ),
      availableCapacity: integer(
        window["availableCapacity"],
        `data.availability.${index}.availableCapacity`,
        1,
      ),
    };
  });
}

function validateBase(event: JsonObject): void {
  if (typeof event["eventId"] !== "string" || !uuid.test(event["eventId"]))
    fail("eventId");
  if (
    typeof event["accommodationId"] !== "string" ||
    !uuid.test(event["accommodationId"])
  )
    fail("accommodationId");
  if (event["schemaVersion"] !== 1) fail("schemaVersion");
  dateTime(event["occurredAt"], "occurredAt");
  integer(event["projectionVersion"], "projectionVersion", 1);
}

function validateData(value: unknown): void {
  const data = object(value, "data");
  const required = [
    "published",
    "name",
    "description",
    "countryCode",
    "city",
    "minNightlyPrice",
    "currency",
    "capacity",
    "amenities",
    "keywords",
    "availability",
    "sourceUpdatedAt",
  ];
  exactKeys(
    data,
    [
      ...required,
      "region",
      "addressSummary",
      "latitude",
      "longitude",
      "primaryPhotoUrl",
    ],
    required,
    "data",
  );
  if (typeof data["published"] !== "boolean") fail("data.published");
  text(data["name"], "data.name", 1, 160);
  text(data["description"], "data.description", 0, 5000);
  if (
    typeof data["countryCode"] !== "string" ||
    !/^[A-Z]{2}$/u.test(data["countryCode"])
  )
    fail("data.countryCode");
  nullableText(data["region"], "data.region", 120);
  text(data["city"], "data.city", 1, 120);
  nullableText(data["addressSummary"], "data.addressSummary", 240);
  if (data["latitude"] !== undefined && data["latitude"] !== null)
    finiteNumber(data["latitude"], "data.latitude", -90, 90);
  if (data["longitude"] !== undefined && data["longitude"] !== null)
    finiteNumber(data["longitude"], "data.longitude", -180, 180);
  finiteNumber(data["minNightlyPrice"], "data.minNightlyPrice", 0);
  if (
    typeof data["currency"] !== "string" ||
    !/^[A-Z]{3}$/u.test(data["currency"])
  )
    fail("data.currency");
  integer(data["capacity"], "data.capacity", 1);
  stringArray(data["amenities"], "data.amenities");
  stringArray(data["keywords"], "data.keywords");
  if (data["primaryPhotoUrl"] !== undefined && data["primaryPhotoUrl"] !== null) {
    if (typeof data["primaryPhotoUrl"] !== "string")
      fail("data.primaryPhotoUrl");
    const url = data["primaryPhotoUrl"];
    try {
      new URL(url);
    } catch {
      fail("data.primaryPhotoUrl");
    }
  }
  availability(data["availability"]);
  dateTime(data["sourceUpdatedAt"], "data.sourceUpdatedAt");
}

export function validateProjectionEvent(value: unknown): ProjectionEvent {
  const event = object(value, "event");
  const base = [
    "eventId",
    "eventType",
    "schemaVersion",
    "occurredAt",
    "accommodationId",
    "projectionVersion",
  ];
  if (event["eventType"] === UPSERTED_PROJECTION_EVENT) {
    exactKeys(event, [...base, "data"], [...base, "data"], "event");
    validateBase(event);
    validateData(event["data"]);
    return event as unknown as UpsertedProjectionEvent;
  }
  if (event["eventType"] === REMOVED_PROJECTION_EVENT) {
    exactKeys(event, base, base, "event");
    validateBase(event);
    return event as unknown as RemovedProjectionEvent;
  }
  fail("eventType");
}
