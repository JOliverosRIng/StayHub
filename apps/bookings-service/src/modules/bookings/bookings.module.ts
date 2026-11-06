import { Module } from '@nestjs/common';
import { ACCOMMODATION_QUOTE_PORT } from '@bookings/application/ports/accommodation-quote.port';
import { CLOCK_PORT, SystemClock } from '@bookings/application/ports/clock.port';
import { CREATE_BOOKING_UOW } from '@bookings/application/ports/create-booking.unit-of-work';
import { OUTBOX_PORT } from '@bookings/application/ports/outbox.port';
import { PAYMENT_ORDERS_PORT } from '@bookings/application/ports/payment-orders.port';
import { SERVICE_TOKEN_PORT } from '@bookings/application/ports/service-token.port';
import { CreateBookingUseCase } from '@bookings/application/create-booking/create-booking.use-case';
import { ApplyPaymentResultUseCase } from '@bookings/application/payments/apply-payment-result.use-case';
import { CreatePaymentOrderWorker } from '@bookings/application/payments/create-payment-order.worker';
import { ExpirePaymentHoldsWorker } from '@bookings/application/payments/expire-payment-holds.worker';
import { AccommodationsBookingQuoteClient } from '@bookings/infrastructure/http/accommodations-booking-quote.client';
import { PaymentsOrdersClient } from '@bookings/infrastructure/http/payments-orders.client';
import { RabbitMqOutboxPublisher } from '@bookings/infrastructure/messaging/rabbitmq-outbox.publisher';
import { BookingRepository } from '@bookings/infrastructure/persistence/prisma/booking.repository';
import { PrismaCreateBookingUnitOfWork } from '@bookings/infrastructure/persistence/prisma/create-booking.unit-of-work';
import { PaymentWorkRepository } from '@bookings/infrastructure/persistence/prisma/payment-work.repository';
import { EnvironmentServiceTokenProvider } from '@bookings/infrastructure/security/environment-service-token.provider';
import { BookingsController } from '@bookings/interfaces/http/bookings/bookings.controller';
import { PrismaPaymentResultUnitOfWork } from '@bookings/infrastructure/persistence/prisma/payment-result.unit-of-work';
import { PaymentHoldExpiryRepository } from '@bookings/infrastructure/persistence/prisma/payment-hold-expiry.repository';
import { BOOKINGS_CONFIG } from '@bookings/infrastructure/config/config.module';
import type { BookingsConfig } from '@bookings/infrastructure/config/bookings-config';
import { ServiceJwtVerifier } from '@bookings/infrastructure/security/service-jwt.verifier';
import { ServiceAuthGuard } from '@bookings/interfaces/http/guards/service-auth.guard';

@Module({ controllers: [BookingsController], providers: [
  BookingRepository, PaymentWorkRepository, PrismaCreateBookingUnitOfWork, PrismaPaymentResultUnitOfWork, PaymentHoldExpiryRepository, AccommodationsBookingQuoteClient, PaymentsOrdersClient, RabbitMqOutboxPublisher, EnvironmentServiceTokenProvider, ServiceJwtVerifier, ServiceAuthGuard,
  { provide: CreateBookingUseCase, inject: [ACCOMMODATION_QUOTE_PORT, CLOCK_PORT, CREATE_BOOKING_UOW, BOOKINGS_CONFIG], useFactory: (quotes: AccommodationsBookingQuoteClient, clock: SystemClock, uow: PrismaCreateBookingUnitOfWork, config: BookingsConfig): CreateBookingUseCase => new CreateBookingUseCase(quotes, clock, uow, config) },
  { provide: ApplyPaymentResultUseCase, inject: [PrismaPaymentResultUnitOfWork], useFactory: (uow: PrismaPaymentResultUnitOfWork): ApplyPaymentResultUseCase => new ApplyPaymentResultUseCase(uow) },
  { provide: CreatePaymentOrderWorker, inject: [PaymentWorkRepository, BookingRepository, PAYMENT_ORDERS_PORT], useFactory: (work: PaymentWorkRepository, bookings: BookingRepository, payments: PaymentsOrdersClient): CreatePaymentOrderWorker => new CreatePaymentOrderWorker(work, bookings, payments) },
  { provide: ExpirePaymentHoldsWorker, inject: [PaymentHoldExpiryRepository], useFactory: (expiry: PaymentHoldExpiryRepository): ExpirePaymentHoldsWorker => new ExpirePaymentHoldsWorker(expiry) },
  { provide: CLOCK_PORT, useClass: SystemClock }, { provide: CREATE_BOOKING_UOW, useExisting: PrismaCreateBookingUnitOfWork }, { provide: ACCOMMODATION_QUOTE_PORT, useExisting: AccommodationsBookingQuoteClient }, { provide: PAYMENT_ORDERS_PORT, useExisting: PaymentsOrdersClient }, { provide: OUTBOX_PORT, useExisting: RabbitMqOutboxPublisher }, { provide: SERVICE_TOKEN_PORT, useExisting: EnvironmentServiceTokenProvider },
] })
export class BookingsModule {}
