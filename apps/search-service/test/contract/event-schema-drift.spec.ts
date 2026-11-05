import { readFileSync } from 'node:fs';
import Ajv2020, { type AnySchema } from 'ajv/dist/2020';
import addFormats from 'ajv-formats';
import { REMOVED_PROJECTION_EVENT, UPSERTED_PROJECTION_EVENT } from '../../src/domain/projection-event';
import { validateProjectionEvent } from '../../src/interfaces/events/projection-event.dto';
import { removedProjectionEventFixture, upsertedProjectionEventFixture } from '../fixtures/projection-events.fixture';

describe('event DTO and fixture drift', () => {
  const schema = JSON.parse(readFileSync(
    '../../specs/002-alojamientos-busqueda/search_service/contracts/search-projection-events-v1.schema.json',
    'utf8',
  )) as AnySchema;
  const ajv = new Ajv2020({ allErrors: true, strict: true });
  addFormats(ajv);
  const validateSchema = ajv.compile(schema);

  const corpus: unknown[] = [
    upsertedProjectionEventFixture,
    removedProjectionEventFixture,
    { ...upsertedProjectionEventFixture, eventType: 'unknown' },
    { ...removedProjectionEventFixture, projectionVersion: 0 },
    { ...removedProjectionEventFixture, extra: true },
    { ...upsertedProjectionEventFixture, data: { ...upsertedProjectionEventFixture.data, currency: 'cop' } },
    { ...upsertedProjectionEventFixture, data: { ...upsertedProjectionEventFixture.data, availability: [{ startDate: '2026-02-30', endDate: '2026-03-02', availableCapacity: 1 }] } },
  ];

  it('keeps runtime event constants equal to schema discriminators', () => {
    const text = JSON.stringify(schema);
    expect(text).toContain(`"const":"${UPSERTED_PROJECTION_EVENT}"`);
    expect(text).toContain(`"const":"${REMOVED_PROJECTION_EVENT}"`);
  });

  it.each(corpus.map((value, index) => [index, value] as const))('agrees for corpus case %s', (_index, value) => {
    const schemaAccepts = validateSchema(value);
    let runtimeAccepts = true;
    try { validateProjectionEvent(value); } catch { runtimeAccepts = false; }
    expect(runtimeAccepts).toBe(schemaAccepts);
  });
});
