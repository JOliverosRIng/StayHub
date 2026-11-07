import { existsSync } from 'node:fs';
import { resolve } from 'node:path';

describe('review persistence TDD contract', () => {
  it('remains red until T041 implements repository and unit of work', () => { expect(existsSync(resolve(__dirname, '../../src/infrastructure/persistence/prisma/review.unit-of-work.ts'))).toBe(true); });
  it.todo('inserts and maps the immutable Review aggregate in PostgreSQL');
  it.todo('enforces bookingId uniqueness and maps the constraint without exposing SQL');
});
