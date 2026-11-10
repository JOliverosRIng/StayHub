import { resolve } from 'node:path';
import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import SwaggerParser from '@apidevtools/swagger-parser';
import Ajv2020 from 'ajv/dist/2020';
import addFormats from 'ajv-formats';
import { CreateBookingUseCase } from '@bookings/application/create-booking/create-booking.use-case';
import { GetBookingUseCase } from '@bookings/application/get-booking/get-booking.use-case';
import { CancelGuestBookingUseCase } from '@bookings/application/cancel-booking/cancel-guest-booking.use-case';
import { CancelOwnerBookingUseCase } from '@bookings/application/cancel-booking/cancel-owner-booking.use-case';
import { GetOwnerBookingHistoryUseCase } from '@bookings/application/owner-history/get-owner-booking-history.use-case';
import { CheckInBookingUseCase } from '@bookings/application/stay-lifecycle/check-in-booking.use-case';
import { CheckOutBookingUseCase } from '@bookings/application/stay-lifecycle/check-out-booking.use-case';
import { GetReviewEligibilityUseCase } from '@bookings/application/stay-lifecycle/get-review-eligibility.use-case';
import { BOOKINGS_CONFIG } from '@bookings/infrastructure/config/config.module';
import { ServiceJwtVerifier } from '@bookings/infrastructure/security/service-jwt.verifier';
import { BookingsController } from '@bookings/interfaces/http/bookings/bookings.controller';
import { StayLifecycleController } from '@bookings/interfaces/http/bookings/stay-lifecycle.controller';
import { ReviewEligibilityController } from '@bookings/interfaces/http/internal/review-eligibility.controller';
import { presentBooking } from '@bookings/interfaces/http/bookings/booking.presenter';
import { presentBookingPage } from '@bookings/interfaces/http/bookings/booking-page.presenter';
import { GUEST_ID, OWNER_ID, storedBooking } from '../fixtures/booking.fixture';

interface DereferencedApi {
  paths?: Record<string, Record<string, { operationId?: string; responses?: Record<string, unknown> }>>;
  components?: { schemas?: Record<string, object> };
}

const contractPath = resolve(__dirname, '../../../../specs/003-reservas-pagos-resenas/booking_service/contracts/openapi-bookings-service.yaml');

describe('bookings OpenAPI drift', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [BookingsController, StayLifecycleController, ReviewEligibilityController],
      providers: [
        { provide: CreateBookingUseCase, useValue: { execute: jest.fn() } },
        { provide: GetBookingUseCase, useValue: { execute: jest.fn() } },
        { provide: CancelGuestBookingUseCase, useValue: { execute: jest.fn() } },
        { provide: CancelOwnerBookingUseCase, useValue: { execute: jest.fn() } },
        { provide: GetOwnerBookingHistoryUseCase, useValue: { execute: jest.fn() } },
        { provide: CheckInBookingUseCase, useValue: { execute: jest.fn() } },
        { provide: CheckOutBookingUseCase, useValue: { execute: jest.fn() } },
        { provide: GetReviewEligibilityUseCase, useValue: { execute: jest.fn() } },
        { provide: BOOKINGS_CONFIG, useValue: { jwtScope: 'bookings:invoke', jwtAudience: 'bookings', reviewEligibilityScope: 'reviews:eligibility', reviewEligibilityAudience: 'bookings' } },
        { provide: ServiceJwtVerifier, useValue: { verify: jest.fn() } },
      ],
    }).compile();
    app = moduleRef.createNestApplication();
    await app.init();
  });

  afterAll(async () => { await app.close(); });

  it('keeps the GET detail operation aligned with the source contract', async () => {
    const api = await SwaggerParser.dereference(contractPath) as unknown as DereferencedApi;
    const operation = api.paths?.['/bookings/{bookingId}']?.get;
    expect(operation?.operationId).toBe('getBooking');
    expect(Object.keys(operation?.responses ?? {})).toEqual(expect.arrayContaining(['200', '400', '401', '404']));
    expect(api.paths?.['/bookings/{bookingId}']?.delete?.operationId).toBe('cancelBooking');
    const history = api.paths?.['/bookings/history']?.get;
    expect(history?.operationId).toBe('getOwnerBookingHistory');
    expect(Object.keys(history?.responses ?? {})).toEqual(expect.arrayContaining(['200', '400', '401', '403']));
    expect(api.paths?.['/bookings/{bookingId}/check-in']?.post?.operationId).toBe('checkInBooking');
    expect(api.paths?.['/bookings/{bookingId}/check-out']?.post?.operationId).toBe('checkOutBooking');
    expect(api.paths?.['/internal/v1/bookings/{bookingId}/review-eligibility']?.get?.operationId).toBe('getReviewEligibility');
  });

  it('exposes the implemented detail route in generated Swagger', () => {
    const document = SwaggerModule.createDocument(app, new DocumentBuilder().setTitle('StayHub Bookings API').setVersion('1.0.0').addBearerAuth({ type: 'http', scheme: 'bearer', bearerFormat: 'JWT' }).build());
    expect(document.paths?.['/bookings']?.post).toBeDefined();
    const detail = document.paths?.['/bookings/{bookingId}']?.get;
    expect(detail).toBeDefined();
    expect(detail?.parameters).toEqual(expect.arrayContaining([expect.objectContaining({ name: 'bookingId', in: 'path' })]));
    expect(document.paths?.['/bookings/{bookingId}']?.delete).toBeDefined();
    expect(document.paths?.['/bookings/history']?.get).toBeDefined();
    expect(document.paths?.['/bookings/{bookingId}/check-in']?.post).toBeDefined();
    expect(document.paths?.['/bookings/{bookingId}/check-out']?.post).toBeDefined();
    expect(document.paths?.['/internal/v1/bookings/{bookingId}/review-eligibility']?.get).toBeDefined();
  });

  it.each([
    { name: 'guest', viewer: { role: 'GUEST', sub: GUEST_ID } },
    { name: 'owner', viewer: { role: 'OWNER', sub: OWNER_ID } },
  ])('validates the $name presenter response against the Booking schema', async ({ viewer }) => {
    const api = await SwaggerParser.dereference(contractPath) as unknown as DereferencedApi;
    const schema = api.components?.schemas?.Booking;
    expect(schema).toBeDefined();
    const ajv = new Ajv2020({ strict: false, allErrors: true });
    addFormats(ajv);
    const validate = ajv.compile(schema as object);
    expect(validate(presentBooking(storedBooking(), viewer))).toBe(true);
  });

  it('validates the owner page presenter response against the BookingPage schema', async () => {
    const api = await SwaggerParser.dereference(contractPath) as unknown as DereferencedApi;
    const schema = api.components?.schemas?.BookingPage;
    expect(schema).toBeDefined();
    const ajv = new Ajv2020({ strict: false, allErrors: true });
    addFormats(ajv);
    const validate = ajv.compile(schema as object);
    const page = { items: [storedBooking()], page: 1, pageSize: 20, total: 1, hasNext: false };
    expect(validate(presentBookingPage(page, { role: 'OWNER', sub: OWNER_ID }))).toBe(true);
  });
});
