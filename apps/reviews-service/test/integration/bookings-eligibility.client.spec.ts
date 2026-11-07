import { existsSync } from 'node:fs';
import { resolve } from 'node:path';

describe('BookingsReviewEligibilityClient TDD contract', () => {
  it('remains red until T040 implements the adapter', () => { expect(existsSync(resolve(__dirname, '../../src/infrastructure/http/bookings-review-eligibility.client.ts'))).toBe(true); });
  it.todo('accepts an exact 200 eligible response and propagates x-request-id');
  it.todo('maps provider 404 to booking not eligible without disclosure');
  it.todo('fails closed for 400/401, timeout, 5xx, malformed JSON and identifier mismatch');
});
