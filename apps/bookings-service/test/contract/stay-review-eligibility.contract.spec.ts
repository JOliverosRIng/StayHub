import type { Server } from 'node:http';
import { INestApplication, UnauthorizedException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { CheckInBookingUseCase } from '@bookings/application/stay-lifecycle/check-in-booking.use-case';
import { CheckOutBookingUseCase } from '@bookings/application/stay-lifecycle/check-out-booking.use-case';
import { GetReviewEligibilityUseCase } from '@bookings/application/stay-lifecycle/get-review-eligibility.use-case';
import { DomainError } from '@bookings/domain/shared/domain-error';
import { BOOKINGS_CONFIG } from '@bookings/infrastructure/config/config.module';
import { ServiceJwtVerifier } from '@bookings/infrastructure/security/service-jwt.verifier';
import { StayLifecycleController } from '@bookings/interfaces/http/bookings/stay-lifecycle.controller';
import { ReviewEligibilityController } from '@bookings/interfaces/http/internal/review-eligibility.controller';
import { ProblemDetailsFilter } from '@bookings/interfaces/http/problem.filter';
import { ClosedValidationPipe } from '@bookings/interfaces/http/validation.pipe';
import { BOOKING_ID, GUEST_ID, OTHER_ID, OWNER_ID, UNKNOWN_BOOKING_ID, storedBooking } from '../fixtures/booking.fixture';
import { reviewEligibilityResponse } from '../fixtures/reviews-handoff.fixture';

const CONFLICT_ID = '00000000-0000-4000-8000-000000000050';

describe('stay lifecycle and review eligibility contract', () => {
  let app: INestApplication;
  const checkIn = {
    execute: jest.fn(async ({ bookingId, ownerId }: { bookingId: string; ownerId: string }) => {
      if (bookingId === UNKNOWN_BOOKING_ID) throw new DomainError('NOT_FOUND');
      if (bookingId === CONFLICT_ID) throw new DomainError('STATE_CONFLICT');
      if (ownerId !== OWNER_ID) throw new DomainError('NOT_FOUND');
      return storedBooking({ status: 'CHECKED_IN', checkedInAt: '2030-01-01T10:00:00.000Z', version: 2 });
    }),
  };
  const checkOut = {
    execute: jest.fn(async ({ bookingId, ownerId }: { bookingId: string; ownerId: string }) => {
      if (bookingId === UNKNOWN_BOOKING_ID) throw new DomainError('NOT_FOUND');
      if (bookingId === CONFLICT_ID) throw new DomainError('STATE_CONFLICT');
      if (ownerId !== OWNER_ID) throw new DomainError('NOT_FOUND');
      return storedBooking({ status: 'COMPLETED', checkedInAt: '2030-01-01T10:00:00.000Z', checkedOutAt: '2030-01-03T10:00:00.000Z', version: 3 });
    }),
  };
  const eligibility = {
    execute: jest.fn(async ({ bookingId, guestId }: { bookingId: string; guestId: string }) => {
      if (bookingId === UNKNOWN_BOOKING_ID || guestId !== GUEST_ID) throw new DomainError('NOT_FOUND');
      return reviewEligibilityResponse({ bookingId, guestId });
    }),
  };
  const verifier = {
    verify: jest.fn(async (token: string, options: { scope?: string; audience?: string } = {}) => {
      const scope = options.scope ?? 'bookings:invoke';
      if (token === 'owner-token' && scope === 'bookings:invoke') return { sub: OWNER_ID, role: 'OWNER', scopes: [scope], claims: {} };
      if (token === 'guest-token' && scope === 'bookings:invoke') return { sub: GUEST_ID, role: 'GUEST', scopes: [scope], claims: {} };
      if (token === 'review-token' && scope === 'reviews:eligibility') return { sub: OTHER_ID, role: 'SERVICE', scopes: [scope], claims: {} };
      throw new UnauthorizedException('Invalid bearer token');
    }),
  };

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [StayLifecycleController, ReviewEligibilityController],
      providers: [
        { provide: CheckInBookingUseCase, useValue: checkIn },
        { provide: CheckOutBookingUseCase, useValue: checkOut },
        { provide: GetReviewEligibilityUseCase, useValue: eligibility },
        { provide: ServiceJwtVerifier, useValue: verifier },
        { provide: BOOKINGS_CONFIG, useValue: { jwtScope: 'bookings:invoke', jwtAudience: 'bookings', reviewEligibilityScope: 'reviews:eligibility', reviewEligibilityAudience: 'bookings' } },
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

  it('requires auth and OWNER role for check-in and check-out', async () => {
    await request(server()).post(`/bookings/${BOOKING_ID}/check-in`).expect(401);
    await request(server()).post(`/bookings/${BOOKING_ID}/check-out`).expect(401);
    await request(server()).post(`/bookings/${BOOKING_ID}/check-in`).set(as('guest-token')).expect(403);
    await request(server()).post(`/bookings/${BOOKING_ID}/check-out`).set(as('guest-token')).expect(403);
  });

  it('validates the booking id and maps state conflicts', async () => {
    await request(server()).post('/bookings/not-a-uuid/check-in').set(as('owner-token')).expect(400);
    await request(server()).post(`/bookings/${UNKNOWN_BOOKING_ID}/check-in`).set(as('owner-token')).expect(404);
    await request(server()).post(`/bookings/${CONFLICT_ID}/check-in`).set(as('owner-token')).expect(409);
    await request(server()).post(`/bookings/${CONFLICT_ID}/check-out`).set(as('owner-token')).expect(409);
  });

  it('checks in and out as the related owner', async () => {
    const checkedIn = await request(server()).post(`/bookings/${BOOKING_ID}/check-in`).set(as('owner-token')).expect(200);
    expect(checkedIn.body).toMatchObject({ id: BOOKING_ID, status: 'CHECKED_IN', ownerId: OWNER_ID });
    const checkedOut = await request(server()).post(`/bookings/${BOOKING_ID}/check-out`).set(as('owner-token')).expect(200);
    expect(checkedOut.body).toMatchObject({ id: BOOKING_ID, status: 'COMPLETED' });
  });

  it('uses a separate review scope and audience for the internal eligibility endpoint', async () => {
    await request(server()).get(`/internal/v1/bookings/${BOOKING_ID}/review-eligibility?guestId=${GUEST_ID}`).expect(401);
    await request(server()).get(`/internal/v1/bookings/${BOOKING_ID}/review-eligibility?guestId=${GUEST_ID}`).set(as('owner-token')).expect(401);
    const response = await request(server()).get(`/internal/v1/bookings/${BOOKING_ID}/review-eligibility?guestId=${GUEST_ID}`).set(as('review-token')).expect(200);
    expect(response.body).toEqual({ bookingId: BOOKING_ID, guestId: GUEST_ID, propertyId: expect.any(String), eligible: true });
    expect(verifier.verify).toHaveBeenCalledWith('review-token', { scope: 'reviews:eligibility', audience: 'bookings' });
  });

  it('does not disclose foreign or invalid eligibility requests', async () => {
    await request(server()).get(`/internal/v1/bookings/${UNKNOWN_BOOKING_ID}/review-eligibility?guestId=${GUEST_ID}`).set(as('review-token')).expect(404);
    await request(server()).get(`/internal/v1/bookings/${BOOKING_ID}/review-eligibility?guestId=${OTHER_ID}`).set(as('review-token')).expect(404);
    await request(server()).get(`/internal/v1/bookings/${BOOKING_ID}/review-eligibility?guestId=not-a-uuid`).set(as('review-token')).expect(400);
  });
});
