import { BadRequestException } from '@nestjs/common';
import type { ArgumentMetadata } from '@nestjs/common';
import { CreateBookingDto } from '@bookings/interfaces/http/dto/create-booking.dto';
import { assertBookingId, assertUuid } from '@bookings/interfaces/http/dto/get-booking.dto';
import { ProblemDetailsFilter } from '@bookings/interfaces/http/problem.filter';
import { ClosedValidationPipe } from '@bookings/interfaces/http/validation.pipe';
import { ServiceAuthGuard } from '@bookings/interfaces/http/guards/service-auth.guard';
import { BookingsLogger } from '@bookings/infrastructure/observability/bookings-logger';

const validBody = {
  propertyId: '00000000-0000-4000-8000-000000000001',
  roomId: '00000000-0000-4000-8000-000000000002',
  checkIn: '2035-01-01',
  checkOut: '2035-01-02',
  guests: 1,
};

describe('bookings security hardening', () => {
  it('rejects closed DTOs with unknown identity or price fields', async () => {
    const pipe = new ClosedValidationPipe();
    const metadata: ArgumentMetadata = { type: 'body', metatype: CreateBookingDto };
    await expect(pipe.transform({ ...validBody, guestId: 'attacker', price: '1.00' }, metadata)).rejects.toBeInstanceOf(BadRequestException);
    await expect(pipe.transform(validBody, metadata)).resolves.toBeInstanceOf(CreateBookingDto);
  });

  it('rejects SQL and path injection in identifiers', () => {
    expect(() => assertBookingId("1' OR '1'='1")).toThrow();
    expect(() => assertBookingId('00000000-0000-4000-8000-000000000001; DROP TABLE bookings')).toThrow();
    expect(() => assertUuid('../../etc/passwd', 'INVALID_GUEST_ID')).toThrow();
    expect(assertBookingId('00000000-0000-4000-8000-000000000001')).toBe('00000000-0000-4000-8000-000000000001');
  });

  it('ignores spoofed identity headers and uses only the verified subject', async () => {
    const guard = new ServiceAuthGuard({ verify: jest.fn(async () => ({ sub: 'trusted-guest', role: 'GUEST', scopes: [], claims: {} })) } as never);
    const request = { headers: { authorization: 'Bearer token', 'x-stayhub-user-id': 'attacker', 'x-user-id': 'attacker' } };
    const context = { switchToHttp: () => ({ getRequest: () => request }) };
    await expect(guard.canActivate(context as never)).resolves.toBe(true);
    expect((request as { principal?: { sub: string } }).principal?.sub).toBe('trusted-guest');
  });

  it('returns Problem Details without stack traces, messages or host secrets', () => {
    const response = { status: jest.fn(), type: jest.fn(), json: jest.fn() };
    response.status.mockReturnValue(response); response.type.mockReturnValue(response);
    const host = { switchToHttp: () => ({ getResponse: () => response, getRequest: () => ({ url: '/bookings', traceId: 'trace-1' }) }) };
    new ProblemDetailsFilter().catch(new Error('db password=super-secret host=internal-db'), host as never);
    expect(response.status).toHaveBeenCalledWith(500);
    const body = response.json.mock.calls[0]?.[0] as Record<string, unknown>;
    expect(body).toMatchObject({ code: 'INTERNAL_ERROR', instance: '/bookings', traceId: 'trace-1' });
    expect(JSON.stringify(body)).not.toContain('super-secret');
    expect(JSON.stringify(body)).not.toContain('internal-db');
    expect(body).not.toHaveProperty('stack');
    expect(body).not.toHaveProperty('message');
  });

  it('redacts sensitive log fields and error traces', () => {
    const write = jest.spyOn(process.stdout, 'write').mockImplementation(() => true);
    try {
      const logger = new BookingsLogger();
      logger.log({ authorization: 'Bearer secret', token: 'token-value', password: 'db-password', email: 'guest@example.com', bookingId: 'safe' });
      logger.error('failure', 'stack with secret');
      const first = String(write.mock.calls[0]?.[0] ?? '');
      const second = String(write.mock.calls[1]?.[0] ?? '');
      expect(first).toContain('[REDACTED]');
      expect(first).not.toContain('Bearer secret');
      expect(first).not.toContain('guest@example.com');
      expect(second).not.toContain('stack with secret');
    } finally { write.mockRestore(); }
  });
});
