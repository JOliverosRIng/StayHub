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

Las pruebas de integración/concurrencia requieren `BOOKINGS_TEST_DATABASE_URL`. Las integraciones reales con Accommodations, Payments, Gateway y Reviews permanecen diferidas; los tests de esta fase usan contratos/stubs y no se presentan como E2E completo.
