import { DomainError } from '@reviews/domain/shared/domain-error';
import { ReviewsLogger } from '@reviews/infrastructure/observability/reviews-logger';
import { problemStatusFor } from '@reviews/interfaces/http/problem.filter';

const GUEST = '00000000-0000-4000-8000-000000000001';

describe('reviews security hardening', () => {
  it('redacts authorization, tokens, guest identity and comments from logs', () => {
    const write = jest.spyOn(process.stdout, 'write').mockImplementation(() => true);
    try {
      new ReviewsLogger().info('review.created', {
        authorization: 'Bearer super-secret',
        token: 'service-token-value',
        comment: 'contenido privado',
        guestId: GUEST,
        nested: { token: 'nested-token-value' },
        route: '/internal/v1/reviews',
      });

      const output = write.mock.calls.map((call) => String(call[0])).join('');
      expect(output).toContain('review.created');
      expect(output).toContain('/internal/v1/reviews');
      expect(output).not.toContain('super-secret');
      expect(output).not.toContain('service-token-value');
      expect(output).not.toContain('contenido privado');
      expect(output).not.toContain(GUEST);
      expect(output).not.toContain('nested-token-value');
    } finally {
      write.mockRestore();
    }
  });

  it('maps stable, safe error codes to HTTP statuses', () => {
    expect(problemStatusFor('INVALID_RATING')).toBe(400);
    expect(problemStatusFor('INVALID_COMMENT')).toBe(400);
    expect(problemStatusFor('INVALID_REVIEW')).toBe(400);
    expect(problemStatusFor('FORBIDDEN')).toBe(403);
    expect(problemStatusFor('BOOKING_NOT_ELIGIBLE')).toBe(404);
    expect(problemStatusFor('NOT_FOUND')).toBe(404);
    expect(problemStatusFor('REVIEW_ALREADY_EXISTS')).toBe(409);
    expect(problemStatusFor('DEPENDENCY_UNAVAILABLE')).toBe(503);
    expect(problemStatusFor('SERVICE_CREDENTIALS_UNAVAILABLE')).toBe(503);
  });

  it('keeps domain errors free of SQL or stack details', () => {
    const error = new DomainError('REVIEW_ALREADY_EXISTS');
    expect(error.message).toBe('REVIEW_ALREADY_EXISTS');
    expect(error.message).not.toMatch(/constraint|SQL|prisma|stack/iu);
  });
});
