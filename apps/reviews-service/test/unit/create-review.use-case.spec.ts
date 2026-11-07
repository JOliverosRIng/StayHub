import { existsSync } from 'node:fs';
import { resolve } from 'node:path';

describe('CreateReviewUseCase TDD contract', () => {
  it('remains red until T042 implements the use case', () => { expect(existsSync(resolve(__dirname, '../../src/application/create-review/create-review.use-case.ts'))).toBe(true); });
  it.todo('creates one review when Bookings confirms matching eligibility');
  it.todo('rejects eligible=false and mismatched booking or guest identifiers');
  it.todo('rejects principals whose role is not GUEST before persistence');
  it.todo('maps duplicate bookingId to REVIEW_ALREADY_EXISTS');
  it.todo('fails closed when Bookings is unavailable');
});
