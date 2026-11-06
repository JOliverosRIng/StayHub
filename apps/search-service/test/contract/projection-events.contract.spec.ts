import { readFileSync } from 'node:fs';
import Ajv2020, { type AnySchema, type ValidateFunction } from 'ajv/dist/2020';
import addFormats from 'ajv-formats';
import {
  removedProjectionEventFixture,
  upsertedProjectionEventFixture,
} from '../fixtures/projection-events.fixture';
import { validateProjectionEvent } from '../../src/interfaces/events/projection-event.dto';

type JsonObject = Record<string, unknown>;

describe('projection events v1 JSON Schema', () => {
  let validate: ValidateFunction;

  beforeAll(() => {
    const schema = JSON.parse(
      readFileSync(
        '../../specs/002-alojamientos-busqueda/search_service/contracts/search-projection-events-v1.schema.json',
        'utf8',
      ),
    ) as unknown as AnySchema;
    const ajv = new Ajv2020({ allErrors: true, strict: true });
    addFormats(ajv);
    validate = ajv.compile(schema);
  });

  it('accepts the upserted and removed variants', () => {
    expect(validate(upsertedProjectionEventFixture)).toBe(true);
    expect(validate(removedProjectionEventFixture)).toBe(true);
    expect(() => validateProjectionEvent(upsertedProjectionEventFixture)).not.toThrow();
    expect(() => validateProjectionEvent(removedProjectionEventFixture)).not.toThrow();
  });

  it.each([
    ['unknown root field', (event: JsonObject): void => { event['unknown'] = true; }],
    ['schema version', (event: JsonObject): void => { event['schemaVersion'] = 2; }],
    ['event UUID', (event: JsonObject): void => { event['eventId'] = 'invalid'; }],
    ['occurredAt', (event: JsonObject): void => { event['occurredAt'] = 'today'; }],
    ['projection version', (event: JsonObject): void => { event['projectionVersion'] = 0; }],
  ] as const)('rejects invalid base field: %s', (_name, mutate) => {
    const event = structuredClone(upsertedProjectionEventFixture) as unknown as JsonObject;
    mutate(event);
    expect(validate(event)).toBe(false);
    expect(() => validateProjectionEvent(event)).toThrow();
  });

  it.each([
    ['name empty', 'name', ''],
    ['name too long', 'name', 'x'.repeat(161)],
    ['description too long', 'description', 'x'.repeat(5001)],
    ['country', 'countryCode', 'co'],
    ['region', 'region', 'x'.repeat(121)],
    ['city', 'city', ''],
    ['address', 'addressSummary', 'x'.repeat(241)],
    ['latitude', 'latitude', 91],
    ['longitude', 'longitude', -181],
    ['price', 'minNightlyPrice', -1],
    ['currency', 'currency', 'cop'],
    ['capacity', 'capacity', 0],
    ['photo URL', 'primaryPhotoUrl', 'not a URI'],
  ])('rejects invalid upsert data: %s', (_name, field, value) => {
    const event = structuredClone(upsertedProjectionEventFixture) as unknown as JsonObject;
    const data = event['data'] as JsonObject;
    data[field] = value;
    expect(validate(event)).toBe(false);
    expect(() => validateProjectionEvent(event)).toThrow();
  });

  it.each([
    ['amenities duplicates', 'amenities', ['wifi', 'wifi']],
    ['amenities max items', 'amenities', Array.from({ length: 101 }, (_, index) => `a${index}`)],
    ['keyword length', 'keywords', ['x'.repeat(61)]],
    ['availability max items', 'availability', Array.from({ length: 367 }, () => ({ startDate: '2026-12-01', endDate: '2026-12-02', availableCapacity: 1 }))],
  ])('rejects invalid collection: %s', (_name, field, value) => {
    const event = structuredClone(upsertedProjectionEventFixture) as unknown as JsonObject;
    const data = event['data'] as JsonObject;
    data[field] = value;
    expect(validate(event)).toBe(false);
    expect(() => validateProjectionEvent(event)).toThrow();
  });

  it('rejects extra or invalid availability fields', () => {
    const event = structuredClone(upsertedProjectionEventFixture) as unknown as JsonObject;
    const data = event['data'] as JsonObject;
    data['availability'] = [{
      startDate: 'not-a-date',
      endDate: '2026-12-02',
      availableCapacity: 0,
      secret: true,
    }];
    expect(validate(event)).toBe(false);
    expect(() => validateProjectionEvent(event)).toThrow();
  });
});
