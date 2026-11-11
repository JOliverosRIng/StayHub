# Bookings service — Sprint 3

NestJS 10 + TypeScript estricto, Prisma 6 y PostgreSQL 16. Es autoridad de reservas y disponibilidad transaccional en el puerto interno 3005. Implementa el incremento US1/RQ-07 con intervalos `[checkIn,checkOut)`, idempotencia, snapshot de Accommodations y saga de Payments.

No procesa dinero, no administra propiedades y no comparte bases. Search sigue siendo una proyección no autoritativa. Los valores de hold/política del `.env.example` son de desarrollo, no política productiva aprobada.

```powershell
npm run prisma:bookings:generate
npm run lint:bookings
npm run typecheck:bookings
npm run test:bookings
npm run build:bookings
```

Las pruebas de integración/concurrencia requieren `BOOKINGS_TEST_DATABASE_URL`. El consumidor RabbitMQ de Payments se prueba con `BOOKINGS_TEST_RABBITMQ_URL` en `test/integration/rabbitmq-payment-consumer.spec.ts`. El REST real Bookings→Payments se verifica mediante `test/e2e/bookings-payments.e2e-spec.ts` y las variables `BOOKINGS_PAYMENTS_E2E_URL`, `BOOKINGS_PAYMENTS_E2E_CHARGE_TOKEN` y `BOOKINGS_PAYMENTS_E2E_REFUND_TOKEN`.

El exchange de entrada es `stayhub.payments` (`BOOKINGS_RABBITMQ_PAYMENTS_EXCHANGE`) y el de salida `stayhub.bookings.v1` (`BOOKINGS_RABBITMQ_EXCHANGE`). Al confirmar un pago, Bookings crea un `NotificationWork` durable en la misma transacción; un worker con `FOR UPDATE SKIP LOCKED` invoca `POST /notifications/events/booking-confirmed` con `propertyName`/`roomName` reales, `totalPrice` string y reintentos limitados. Requiere `BOOKINGS_NOTIFICATIONS_URL`, `BOOKINGS_NOTIFICATIONS_JWT_AUDIENCE`, `BOOKINGS_NOTIFICATIONS_JWT_SCOPE` y el token dedicado `BOOKINGS_NOTIFICATIONS_SERVICE_TOKEN(_FILE)` (con fallback al token saliente). Payments exige un scope exacto por operación, por lo que `BOOKINGS_OUTBOUND_SERVICE_TOKENS_JSON` debe mapear `payments-service:payments:charge` y `payments-service:payments:refund` a sus tokens.

El flujo completo Payments→Bookings→Notifications y Bookings↔Reviews se verifica con `npm run test:unir:e2e` (harness aislado con PostgreSQL, RabbitMQ, HTTP y contenedores reales; 8 escenarios PASS).
