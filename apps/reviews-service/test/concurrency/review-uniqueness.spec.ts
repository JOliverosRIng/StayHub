import { existsSync } from 'node:fs';
import { resolve } from 'node:path';

describe('review booking uniqueness TDD contract', () => {
  it('remains red until T041 provides a concurrency-safe unit of work', () => { expect(existsSync(resolve(__dirname, '../../src/infrastructure/persistence/prisma/review.unit-of-work.ts'))).toBe(true); });
  it.todo('allows exactly one of two simultaneous inserts for the same bookingId');
  it.todo('returns REVIEW_ALREADY_EXISTS for the losing request and leaves one row');
});
