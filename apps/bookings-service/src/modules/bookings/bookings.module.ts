import { Module } from '@nestjs/common';
import { ACCOMMODATION_QUOTE_PORT } from '@bookings/application/ports/accommodation-quote.port';
import { CLOCK_PORT, SystemClock } from '@bookings/application/ports/clock.port';
import { CREATE_BOOKING_UOW } from '@bookings/application/ports/create-booking.unit-of-work';
import { CANCELLATION_POLICY_PORT } from '@bookings/application/ports/cancellation-policy.port';
import { CANCEL_GUEST_BOOKING_UOW } from '@bookings/application/ports/cancel-guest-booking.unit-of-work';
import { CANCEL_OWNER_BOOKING_UOW } from '@bookings/application/ports/cancel-owner-booking.unit-of-work';
import { OWNER_BOOKING_HISTORY_PORT } from '@bookings/application/ports/owner-booking-history.port';
import { STAY_LIFECYCLE_UOW } from '@bookings/application/ports/stay-lifecycle.unit-of-work';
import { OUTBOX_PORT } from '@bookings/application/ports/outbox.port';
import { PAYMENT_ORDERS_PORT } from '@bookings/application/ports/payment-orders.port';
import { PAYMENT_REFUNDS_PORT, REFUND_WORK_PORT } from '@bookings/application/ports/payment-refunds.port';
import { SERVICE_TOKEN_PORT } from '@bookings/application/ports/service-token.port';
import { BOOKING_NOTIFICATIONS_PORT } from '@bookings/application/ports/booking-notifications.port';
import { NOTIFICATION_WORK_PORT } from '@bookings/application/ports/notification-work.port';
import { CreateBookingUseCase } from '@bookings/application/create-booking/create-booking.use-case';
import { GetBookingUseCase } from '@bookings/application/get-booking/get-booking.use-case';
import { CancelGuestBookingUseCase } from '@bookings/application/cancel-booking/cancel-guest-booking.use-case';
import { CancelOwnerBookingUseCase } from '@bookings/application/cancel-booking/cancel-owner-booking.use-case';
import { GetOwnerBookingHistoryUseCase } from '@bookings/application/owner-history/get-owner-booking-history.use-case';
import { CheckInBookingUseCase } from '@bookings/application/stay-lifecycle/check-in-booking.use-case';
import { CheckOutBookingUseCase } from '@bookings/application/stay-lifecycle/check-out-booking.use-case';
import { GetReviewEligibilityUseCase } from '@bookings/application/stay-lifecycle/get-review-eligibility.use-case';
import { ApplyPaymentResultUseCase } from '@bookings/application/payments/apply-payment-result.use-case';
import { ApplyRefundResultUseCase } from '@bookings/application/payments/apply-refund-result.use-case';
import { CreatePaymentOrderWorker } from '@bookings/application/payments/create-payment-order.worker';
import { ExpirePaymentHoldsWorker } from '@bookings/application/payments/expire-payment-holds.worker';
import { RequestRefundWorker } from '@bookings/application/payments/request-refund.worker';
import { SendBookingConfirmedNotificationWorker } from '@bookings/application/notifications/send-booking-confirmed-notification.worker';
import { NotificationWorkScheduler } from '@bookings/infrastructure/scheduling/notification-work.scheduler';
import { BookingsWorkersScheduler } from '@bookings/infrastructure/scheduling/bookings-workers.scheduler';
import { NotificationDeliveryHealth } from '@bookings/infrastructure/observability/notification-delivery-health';
import { AccommodationsBookingQuoteClient } from '@bookings/infrastructure/http/accommodations-booking-quote.client';
import { PaymentsOrdersClient } from '@bookings/infrastructure/http/payments-orders.client';
import { PaymentsRefundsClient } from '@bookings/infrastructure/http/payments-refunds.client';
import { NotificationsClient } from '@bookings/infrastructure/http/notifications.client';
import { RabbitMqOutboxPublisher } from '@bookings/infrastructure/messaging/rabbitmq-outbox.publisher';
import { RabbitMqPaymentConsumer } from '@bookings/infrastructure/messaging/rabbitmq-payment.consumer';
import { BookingRepository } from '@bookings/infrastructure/persistence/prisma/booking.repository';
import { PrismaCreateBookingUnitOfWork } from '@bookings/infrastructure/persistence/prisma/create-booking.unit-of-work';
import { PrismaCancelGuestBookingUnitOfWork } from '@bookings/infrastructure/persistence/prisma/cancel-booking.unit-of-work';
import { PrismaCancelOwnerBookingUnitOfWork } from '@bookings/infrastructure/persistence/prisma/cancel-owner-booking.unit-of-work';
import { PrismaOwnerBookingHistoryQuery } from '@bookings/infrastructure/persistence/prisma/owner-booking-history.query';
import { PrismaStayLifecycleUnitOfWork } from '@bookings/infrastructure/persistence/prisma/stay-lifecycle.unit-of-work';
import { PrismaRefundResultUnitOfWork } from '@bookings/infrastructure/persistence/prisma/refund-result.unit-of-work';
import { PaymentWorkRepository } from '@bookings/infrastructure/persistence/prisma/payment-work.repository';
import { NotificationWorkRepository } from '@bookings/infrastructure/persistence/prisma/notification-work.repository';
import { EnvironmentServiceTokenProvider } from '@bookings/infrastructure/security/environment-service-token.provider';
import { VersionedCancellationPolicyAdapter } from '@bookings/infrastructure/config/versioned-cancellation-policy.adapter';
import { BookingsController } from '@bookings/interfaces/http/bookings/bookings.controller';
import { StayLifecycleController } from '@bookings/interfaces/http/bookings/stay-lifecycle.controller';
import { ReviewEligibilityController } from '@bookings/interfaces/http/internal/review-eligibility.controller';
import { PrismaPaymentResultUnitOfWork } from '@bookings/infrastructure/persistence/prisma/payment-result.unit-of-work';
import { PaymentHoldExpiryRepository } from '@bookings/infrastructure/persistence/prisma/payment-hold-expiry.repository';
import { BOOKINGS_CONFIG } from '@bookings/infrastructure/config/config.module';
import type { BookingsConfig } from '@bookings/infrastructure/config/bookings-config';
import { ServiceJwtVerifier } from '@bookings/infrastructure/security/service-jwt.verifier';
import { ServiceAuthGuard } from '@bookings/interfaces/http/guards/service-auth.guard';
import { ReviewServiceGuard } from '@bookings/interfaces/http/guards/review-service.guard';

@Module({ controllers: [BookingsController, StayLifecycleController, ReviewEligibilityController], providers: [
  BookingRepository, PaymentWorkRepository, NotificationWorkRepository, PrismaCreateBookingUnitOfWork, PrismaCancelGuestBookingUnitOfWork, PrismaCancelOwnerBookingUnitOfWork, PrismaOwnerBookingHistoryQuery, PrismaStayLifecycleUnitOfWork, PrismaPaymentResultUnitOfWork, PrismaRefundResultUnitOfWork, PaymentHoldExpiryRepository, AccommodationsBookingQuoteClient, PaymentsOrdersClient, PaymentsRefundsClient, NotificationsClient, RabbitMqOutboxPublisher, RabbitMqPaymentConsumer, VersionedCancellationPolicyAdapter, EnvironmentServiceTokenProvider, ServiceJwtVerifier, ServiceAuthGuard, ReviewServiceGuard, NotificationWorkScheduler, BookingsWorkersScheduler, NotificationDeliveryHealth,
  { provide: CreateBookingUseCase, inject: [ACCOMMODATION_QUOTE_PORT, CLOCK_PORT, CREATE_BOOKING_UOW, BOOKINGS_CONFIG], useFactory: (quotes: AccommodationsBookingQuoteClient, clock: SystemClock, uow: PrismaCreateBookingUnitOfWork, config: BookingsConfig): CreateBookingUseCase => new CreateBookingUseCase(quotes, clock, uow, config) },
  { provide: GetBookingUseCase, inject: [BookingRepository], useFactory: (bookings: BookingRepository): GetBookingUseCase => new GetBookingUseCase(bookings) },
  { provide: CancelGuestBookingUseCase, inject: [BookingRepository, CANCELLATION_POLICY_PORT, CANCEL_GUEST_BOOKING_UOW, CLOCK_PORT], useFactory: (bookings: BookingRepository, policy: VersionedCancellationPolicyAdapter, uow: PrismaCancelGuestBookingUnitOfWork, clock: SystemClock): CancelGuestBookingUseCase => new CancelGuestBookingUseCase(bookings, policy, uow, clock) },
  { provide: CancelOwnerBookingUseCase, inject: [BookingRepository, CANCEL_OWNER_BOOKING_UOW, CLOCK_PORT, BOOKINGS_CONFIG], useFactory: (bookings: BookingRepository, uow: PrismaCancelOwnerBookingUnitOfWork, clock: SystemClock, config: BookingsConfig): CancelOwnerBookingUseCase => new CancelOwnerBookingUseCase(bookings, uow, clock, config) },
  { provide: GetOwnerBookingHistoryUseCase, inject: [OWNER_BOOKING_HISTORY_PORT], useFactory: (history: PrismaOwnerBookingHistoryQuery): GetOwnerBookingHistoryUseCase => new GetOwnerBookingHistoryUseCase(history) },
  { provide: CheckInBookingUseCase, inject: [BookingRepository, STAY_LIFECYCLE_UOW, CLOCK_PORT], useFactory: (bookings: BookingRepository, uow: PrismaStayLifecycleUnitOfWork, clock: SystemClock): CheckInBookingUseCase => new CheckInBookingUseCase(bookings, uow, clock) },
  { provide: CheckOutBookingUseCase, inject: [BookingRepository, STAY_LIFECYCLE_UOW, CLOCK_PORT], useFactory: (bookings: BookingRepository, uow: PrismaStayLifecycleUnitOfWork, clock: SystemClock): CheckOutBookingUseCase => new CheckOutBookingUseCase(bookings, uow, clock) },
  { provide: GetReviewEligibilityUseCase, inject: [BookingRepository], useFactory: (bookings: BookingRepository): GetReviewEligibilityUseCase => new GetReviewEligibilityUseCase(bookings) },
  { provide: ApplyPaymentResultUseCase, inject: [PrismaPaymentResultUnitOfWork], useFactory: (uow: PrismaPaymentResultUnitOfWork): ApplyPaymentResultUseCase => new ApplyPaymentResultUseCase(uow) },
  { provide: ApplyRefundResultUseCase, inject: [PrismaRefundResultUnitOfWork], useFactory: (uow: PrismaRefundResultUnitOfWork): ApplyRefundResultUseCase => new ApplyRefundResultUseCase(uow) },
  { provide: CreatePaymentOrderWorker, inject: [PaymentWorkRepository, BookingRepository, PAYMENT_ORDERS_PORT], useFactory: (work: PaymentWorkRepository, bookings: BookingRepository, payments: PaymentsOrdersClient): CreatePaymentOrderWorker => new CreatePaymentOrderWorker(work, bookings, payments) },
  { provide: RequestRefundWorker, inject: [REFUND_WORK_PORT, BookingRepository, PAYMENT_REFUNDS_PORT], useFactory: (work: PaymentWorkRepository, bookings: BookingRepository, refunds: PaymentsRefundsClient): RequestRefundWorker => new RequestRefundWorker(work, bookings, refunds) },
  { provide: ExpirePaymentHoldsWorker, inject: [PaymentHoldExpiryRepository], useFactory: (expiry: PaymentHoldExpiryRepository): ExpirePaymentHoldsWorker => new ExpirePaymentHoldsWorker(expiry) },
  { provide: SendBookingConfirmedNotificationWorker, inject: [NOTIFICATION_WORK_PORT, BookingRepository, BOOKING_NOTIFICATIONS_PORT, BOOKINGS_CONFIG], useFactory: (work: NotificationWorkRepository, bookings: BookingRepository, notifications: NotificationsClient, config: BookingsConfig): SendBookingConfirmedNotificationWorker => new SendBookingConfirmedNotificationWorker(work, bookings, notifications, config.notificationMaxAttempts) },
  { provide: NOTIFICATION_WORK_PORT, useExisting: NotificationWorkRepository }, { provide: BOOKING_NOTIFICATIONS_PORT, useExisting: NotificationsClient },
  { provide: CLOCK_PORT, useClass: SystemClock }, { provide: CREATE_BOOKING_UOW, useExisting: PrismaCreateBookingUnitOfWork }, { provide: ACCOMMODATION_QUOTE_PORT, useExisting: AccommodationsBookingQuoteClient }, { provide: PAYMENT_ORDERS_PORT, useExisting: PaymentsOrdersClient }, { provide: PAYMENT_REFUNDS_PORT, useExisting: PaymentsRefundsClient }, { provide: CANCELLATION_POLICY_PORT, useExisting: VersionedCancellationPolicyAdapter }, { provide: CANCEL_GUEST_BOOKING_UOW, useExisting: PrismaCancelGuestBookingUnitOfWork }, { provide: CANCEL_OWNER_BOOKING_UOW, useExisting: PrismaCancelOwnerBookingUnitOfWork }, { provide: OWNER_BOOKING_HISTORY_PORT, useExisting: PrismaOwnerBookingHistoryQuery }, { provide: STAY_LIFECYCLE_UOW, useExisting: PrismaStayLifecycleUnitOfWork }, { provide: REFUND_WORK_PORT, useExisting: PaymentWorkRepository }, { provide: OUTBOX_PORT, useExisting: RabbitMqOutboxPublisher }, { provide: SERVICE_TOKEN_PORT, useExisting: EnvironmentServiceTokenProvider },
], exports: [RabbitMqPaymentConsumer, NotificationDeliveryHealth] })
export class BookingsModule {}
