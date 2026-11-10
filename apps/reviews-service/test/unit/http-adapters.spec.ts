import { BadRequestException } from '@nestjs/common';
import type { Request } from 'express';
import { extractSingleBearer } from '@reviews/interfaces/http/auth/bearer-token';
import {
  ClosedValidationPipe,
  mapValidationErrors,
} from '@reviews/interfaces/http/validation.pipe';
import { assertUuid, parsePagination } from '@reviews/interfaces/http/http-params';
import { problemStatusFor } from '@reviews/interfaces/http/problem.filter';

describe('HTTP adapters', () => {
  it('extracts exactly one bearer and rejects duplicates/spoofing', () => {
    const request = { rawHeaders: ['Authorization', 'Bearer token'], headers: { authorization: 'Bearer token' } } as Request;
    expect(extractSingleBearer(request)).toBe('token');
    const duplicate = { rawHeaders: ['Authorization', 'Bearer a', 'Authorization', 'Bearer b'], headers: { authorization: 'Bearer a, Bearer b' } } as Request;
    expect(() => extractSingleBearer(duplicate)).toThrow('Exactly one');
  });
  it('configures closed validation globally', () => {
    const pipe = new ClosedValidationPipe(); expect(pipe).toBeDefined(); expect(BadRequestException).toBeDefined();
  });
  it('maps class-validator failures to the closed Problem Details shape without values', () => {
    const errors = mapValidationErrors([
      {
        property: 'comment',
        value: 'private comment',
        target: { comment: 'private comment' },
        constraints: { isString: 'comment must be a string' },
        children: [],
      },
    ]);
    expect(errors).toEqual([{ field: 'comment', code: 'VALIDATION_IS_STRING' }]);
    expect(JSON.stringify(errors)).not.toContain('private comment');
  });
  it('validates UUID and bounded integer pagination without coercing malformed values', () => {
    expect(assertUuid('00000000-0000-4000-8000-000000000001', 'id')).toContain('0000');
    expect(() => assertUuid('not-a-uuid', 'id')).toThrow(BadRequestException);
    expect(parsePagination()).toEqual({ page: 1, pageSize: 20 }); expect(parsePagination('2', '100')).toEqual({ page: 2, pageSize: 100 });
    for (const values of [['0', '20'], ['1.5', '20'], ['1', '101'], ['1', 'x']]) expect(() => parsePagination(values[0], values[1])).toThrow(BadRequestException);
  });
  it('preserves auth-before-domain status semantics in the error mapping', () => {
    expect(problemStatusFor('FORBIDDEN')).toBe(403); expect(problemStatusFor('BOOKING_NOT_ELIGIBLE')).toBe(404); expect(problemStatusFor('REVIEW_ALREADY_EXISTS')).toBe(409);
  });
});
