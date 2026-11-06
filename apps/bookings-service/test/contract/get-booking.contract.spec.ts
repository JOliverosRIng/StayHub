import type { Server } from 'node:http';
import { INestApplication, UnauthorizedException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { CreateBookingUseCase } from '@bookings/application/create-booking/create-booking.use-case';
import { GetBookingUseCase } from '@bookings/application/get-booking/get-booking.use-case';
import { CancelGuestBookingUseCase } from '@bookings/application/cancel-booking/cancel-guest-booking.use-case';
import { CancelOwnerBookingUseCase } from '@bookings/application/cancel-booking/cancel-owner-booking.use-case';
import { GetOwnerBookingHistoryUseCase } from '@bookings/application/owner-history/get-owner-booking-history.use-case';
import { DomainError } from '@bookings/domain/shared/domain-error';
import { ServiceJwtVerifier } from '@bookings/infrastructure/security/service-jwt.verifier';
import { BookingsController } from '@bookings/interfaces/http/bookings/bookings.controller';
import { assertBookingId } from '@bookings/interfaces/http/dto/get-booking.dto';
import { ProblemDetailsFilter } from '@bookings/interfaces/http/problem.filter';
import { ClosedValidationPipe } from '@bookings/interfaces/http/validation.pipe';
import { BOOKING_ID, GUEST_ID, UNKNOWN_BOOKING_ID, storedBooking } from '../fixtures/booking.fixture';

describe('GET /bookings/{bookingId} contract', () => {
  let app: INestApplication;
  const getBooking = {
    execute: jest.fn(async (query: { bookingId: string; actorId: string; actorRole?: string }) => {
      if (query.bookingId !== BOOKING_ID || query.actorId !== GUEST_ID || query.actorRole !== 'GUEST') throw new DomainError('NOT_FOUND');
      return { booking: storedBooking(), viewer: { role: 'GUEST' as const, sub: GUEST_ID } };
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
        { provide: GetBookingUseCase, useValue: getBooking },
        { provide: CancelGuestBookingUseCase, useValue: { execute: jest.fn() } },
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

  it('accepts only UUID booking identifiers', () => {
    expect(assertBookingId(BOOKING_ID)).toBe(BOOKING_ID);
    expect(() => assertBookingId('not-a-uuid')).toThrow();
    expect(() => assertBookingId(undefined)).toThrow();
  });

  it('rejects unauthenticated callers with 401', async () => {
    await request(server()).get(`/bookings/${BOOKING_ID}`).expect(401);
  });

  it('rejects a non UUID identifier with 400', async () => {
    await request(server()).get('/bookings/not-a-uuid').set('Authorization', 'Bearer valid-token').expect(400);
  });

  it('returns not found for a booking outside the caller scope', async () => {
    await request(server()).get(`/bookings/${UNKNOWN_BOOKING_ID}`).set('Authorization', 'Bearer valid-token').expect(404);
  });

  it('returns 200 with the Booking contract shape and without secrets', async () => {
    const response = await request(server()).get(`/bookings/${BOOKING_ID}`).set('Authorization', 'Bearer valid-token').expect(200);
    expect(response.body).toMatchObject({
      id: BOOKING_ID,
      guestId: GUEST_ID,
      propertyId: expect.any(String),
      roomId: expect.any(String),
      propertyName: 'Snapshot Property',
      roomName: 'Snapshot Room',
      checkIn: '2030-01-01',
      checkOut: '2030-01-03',
      guests: 2,
      nights: 2,
      nightlyPrice: { amount: '10.50', currency: 'USD' },
      total: { amount: '21.00', currency: 'USD' },
      status: 'CONFIRMED',
      paymentStatus: 'CAPTURED',
      createdAt: expect.any(String),
      updatedAt: expect.any(String),
    });
    expect(response.body.ownerId).toBeUndefined();
    expect(response.body.paymentOrderId).toBeUndefined();
  });
});
