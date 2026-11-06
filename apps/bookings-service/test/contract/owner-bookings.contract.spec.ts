import type { Server } from 'node:http';
import { INestApplication, UnauthorizedException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { CancelGuestBookingUseCase } from '@bookings/application/cancel-booking/cancel-guest-booking.use-case';
import { CancelOwnerBookingUseCase } from '@bookings/application/cancel-booking/cancel-owner-booking.use-case';
import { CreateBookingUseCase } from '@bookings/application/create-booking/create-booking.use-case';
import { GetBookingUseCase } from '@bookings/application/get-booking/get-booking.use-case';
import { GetOwnerBookingHistoryUseCase } from '@bookings/application/owner-history/get-owner-booking-history.use-case';
import { DomainError } from '@bookings/domain/shared/domain-error';
import { ServiceJwtVerifier } from '@bookings/infrastructure/security/service-jwt.verifier';
import { BookingsController } from '@bookings/interfaces/http/bookings/bookings.controller';
import { ProblemDetailsFilter } from '@bookings/interfaces/http/problem.filter';
import { ClosedValidationPipe } from '@bookings/interfaces/http/validation.pipe';
import { BOOKING_ID, GUEST_ID, OWNER_ID, UNKNOWN_BOOKING_ID, storedBooking } from '../fixtures/booking.fixture';

describe('owner bookings contract', () => {
  let app: INestApplication;
  const history = {
    execute: jest.fn(async () => ({ items: [storedBooking()], page: 1, pageSize: 20, total: 1, hasNext: false })),
  };
  const cancelOwner = {
    execute: jest.fn(async ({ bookingId, reason }: { bookingId: string; reason: string }) => {
      if (bookingId !== BOOKING_ID) throw new DomainError('NOT_FOUND');
      return storedBooking({ status: 'CANCELLED_BY_OWNER', cancelledBy: 'OWNER', cancelledAt: '2035-01-01T00:00:00.000Z', cancellationReason: reason, cancellationPolicyVersion: 'v1', version: 2 });
    }),
  };
  const cancelGuest = {
    execute: jest.fn(async () => storedBooking({ status: 'CANCELLED_BY_GUEST', cancelledBy: 'GUEST', cancelledAt: '2035-01-01T00:00:00.000Z', version: 2 })),
  };
  const verifier = {
    verify: jest.fn(async (token: string) => {
      if (token === 'owner-token') return { sub: OWNER_ID, role: 'OWNER', scopes: ['bookings:invoke'], claims: {} };
      if (token === 'guest-token') return { sub: GUEST_ID, role: 'GUEST', scopes: ['bookings:invoke'], claims: {} };
      if (token === 'admin-token') return { sub: '00000000-0000-4000-8000-000000000003', role: 'ADMIN', scopes: ['bookings:invoke'], claims: {} };
      throw new UnauthorizedException('Invalid bearer token');
    }),
  };

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [BookingsController],
      providers: [
        { provide: CreateBookingUseCase, useValue: { execute: jest.fn() } },
        { provide: GetBookingUseCase, useValue: { execute: jest.fn() } },
        { provide: CancelGuestBookingUseCase, useValue: cancelGuest },
        { provide: CancelOwnerBookingUseCase, useValue: cancelOwner },
        { provide: GetOwnerBookingHistoryUseCase, useValue: history },
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
  const as = (token: string) => ({ Authorization: `Bearer ${token}` });

  it('requires authentication for history and cancellation', async () => {
    await request(server()).get('/bookings/history').expect(401);
    await request(server()).delete(`/bookings/${BOOKING_ID}`).expect(401);
  });

  it('denies history to guests and admins', async () => {
    await request(server()).get('/bookings/history').set(as('guest-token')).expect(403);
    await request(server()).get('/bookings/history').set(as('admin-token')).expect(403);
  });

  it('returns the owner page contract with pagination metadata', async () => {
    const response = await request(server()).get('/bookings/history?page=1&pageSize=20&status=CONFIRMED').set(as('owner-token')).expect(200);
    expect(response.body).toMatchObject({ page: 1, pageSize: 20, total: 1, hasNext: false, items: [expect.objectContaining({ id: BOOKING_ID, ownerId: OWNER_ID, nightlyPrice: { amount: '10.50', currency: 'USD' } })] });
    expect(response.body.items[0].paymentOrderId).toBeUndefined();
  });

  it.each(['page=0', 'pageSize=101', 'page=abc', 'status=UNKNOWN', 'guestId=not-a-uuid', 'from=2033-13-01'])('rejects invalid history query %s', async (query) => {
    await request(server()).get(`/bookings/history?${query}`).set(as('owner-token')).expect(400);
  });

  it('cancels as owner with a reason and exposes it in the response', async () => {
    const response = await request(server()).delete(`/bookings/${BOOKING_ID}`).set(as('owner-token')).send({ reason: 'Maintenance' }).expect(200);
    expect(response.body).toMatchObject({ status: 'CANCELLED_BY_OWNER', cancellationReason: 'Maintenance' });
  });

  it('rejects owner cancellation without a reason or with more than 500 characters', async () => {
    await request(server()).delete(`/bookings/${BOOKING_ID}`).set(as('owner-token')).send({}).expect(400);
    await request(server()).delete(`/bookings/${BOOKING_ID}`).set(as('owner-token')).send({ reason: 'a'.repeat(501) }).expect(400);
    await request(server()).delete(`/bookings/${BOOKING_ID}`).set(as('owner-token')).send({ reason: '   ' }).expect(400);
  });

  it('returns not found for a booking owned by another owner', async () => {
    await request(server()).delete(`/bookings/${UNKNOWN_BOOKING_ID}`).set(as('owner-token')).send({ reason: 'Maintenance' }).expect(404);
  });

  it('keeps guest cancellation working and denies admins', async () => {
    await request(server()).delete(`/bookings/${BOOKING_ID}`).set(as('guest-token')).expect(200);
    await request(server()).delete(`/bookings/${BOOKING_ID}`).set(as('admin-token')).send({ reason: 'Maintenance' }).expect(403);
  });
});
