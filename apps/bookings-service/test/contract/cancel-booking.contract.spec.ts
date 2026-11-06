import type { Server } from 'node:http';
import { INestApplication, UnauthorizedException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { CancelGuestBookingUseCase } from '@bookings/application/cancel-booking/cancel-guest-booking.use-case';
import { CancelOwnerBookingUseCase } from '@bookings/application/cancel-booking/cancel-owner-booking.use-case';
import { GetOwnerBookingHistoryUseCase } from '@bookings/application/owner-history/get-owner-booking-history.use-case';
import { CreateBookingUseCase } from '@bookings/application/create-booking/create-booking.use-case';
import { GetBookingUseCase } from '@bookings/application/get-booking/get-booking.use-case';
import { DomainError } from '@bookings/domain/shared/domain-error';
import { ServiceJwtVerifier } from '@bookings/infrastructure/security/service-jwt.verifier';
import { BookingsController } from '@bookings/interfaces/http/bookings/bookings.controller';
import { ProblemDetailsFilter } from '@bookings/interfaces/http/problem.filter';
import { ClosedValidationPipe } from '@bookings/interfaces/http/validation.pipe';
import { BOOKING_ID, GUEST_ID, storedBooking } from '../fixtures/booking.fixture';

const DENIED_ID = '00000000-0000-4000-8000-000000000010';
const UNAVAILABLE_ID = '00000000-0000-4000-8000-000000000011';

describe('DELETE /bookings/{bookingId} contract', () => {
  let app: INestApplication;
  const cancelGuest = {
    execute: jest.fn(async ({ bookingId }: { bookingId: string }) => {
      if (bookingId === DENIED_ID) throw new DomainError('CANCELLATION_NOT_ALLOWED');
      if (bookingId === UNAVAILABLE_ID) throw new DomainError('DEPENDENCY_UNAVAILABLE');
      if (bookingId !== BOOKING_ID) throw new DomainError('NOT_FOUND');
      return storedBooking({ status: 'CANCELLED_BY_GUEST', cancelledBy: 'GUEST', cancelledAt: '2030-01-01T00:00:00.000Z', cancellationPolicyVersion: 'v1', version: 2 });
    }),
  };
  const verifier = {
    verify: jest.fn(async (token: string) => {
      if (token !== 'valid-token') throw new UnauthorizedException('Invalid bearer token');
      return { sub: GUEST_ID, role: 'GUEST', scopes: ['bookings:invoke'], claims: {} };
    }),
  };

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [BookingsController],
      providers: [
        { provide: CreateBookingUseCase, useValue: { execute: jest.fn() } },
        { provide: GetBookingUseCase, useValue: { execute: jest.fn() } },
        { provide: CancelGuestBookingUseCase, useValue: cancelGuest },
        { provide: CancelOwnerBookingUseCase, useValue: { execute: jest.fn() } },
        { provide: GetOwnerBookingHistoryUseCase, useValue: { execute: jest.fn() } },
        { provide: ServiceJwtVerifier, useValue: verifier },
      ],
    }).compile();
    app = moduleRef.createNestApplication();
    app.useGlobalPipes(new ClosedValidationPipe());
    app.useGlobalFilters(new ProblemDetailsFilter());
    await app.init();
  });

  afterAll(async () => { await app.close(); });

  const server = (): Server => app.getHttpServer() as Server;

  it('rejects unauthenticated callers with 401', async () => {
    await request(server()).delete(`/bookings/${BOOKING_ID}`).expect(401);
  });

  it('rejects a non UUID identifier with 400', async () => {
    await request(server()).delete('/bookings/not-a-uuid').set('Authorization', 'Bearer valid-token').expect(400);
  });

  it('returns not found for a booking outside the guest scope', async () => {
    await request(server()).delete(`/bookings/${'00000000-0000-4000-8000-000000000099'}`).set('Authorization', 'Bearer valid-token').expect(404);
  });

  it('returns conflict when the approved policy is not eligible', async () => {
    const response = await request(server()).delete(`/bookings/${DENIED_ID}`).set('Authorization', 'Bearer valid-token').expect(409);
    expect(response.body.code).toBe('CANCELLATION_NOT_ALLOWED');
  });

  it('returns 503 when the policy or an external dependency is unavailable', async () => {
    await request(server()).delete(`/bookings/${UNAVAILABLE_ID}`).set('Authorization', 'Bearer valid-token').expect(503);
  });

  it('returns 200 with the cancelled Booking contract shape and without secrets', async () => {
    const response = await request(server()).delete(`/bookings/${BOOKING_ID}`).set('Authorization', 'Bearer valid-token').expect(200);
    expect(response.body).toMatchObject({ id: BOOKING_ID, status: 'CANCELLED_BY_GUEST', nightlyPrice: { amount: '10.50', currency: 'USD' }, total: { amount: '21.00', currency: 'USD' } });
    expect(response.body.ownerId).toBeUndefined();
    expect(response.body.paymentOrderId).toBeUndefined();
  });
});
