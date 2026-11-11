# Validation Report — bookings-service (Sprint 3)

**Fecha**: 2026-11-11
**Alcance**: RQ-07, RQ-08, RQ-09, RQ-10 y contribución parcial a RQ-11.
**Estado**: Sprint 3 backend técnicamente completo; Gateway↔Bookings, Accommodations→Bookings→Payments→Notifications y Bookings↔Reviews validados con PostgreSQL, Redis, RabbitMQ, HTTP y contenedores reales.

## 1. Tareas

| Rango | Estado | Nota |
|---|---|---|
| T001–T094 | Completadas | Setup, Foundation, US1–US5, gates de contratos/seguridad/rendimiento y E2E aislado. |
| T078 | Completada | Evidencia PostgreSQL real de US4/US5 registrada en `quickstart.md`. |
| T099 | Completada | Shutdown ordenado y contrato de contenedor. |
| T100–T101 | Completadas | Quickstart ejecutado con PostgreSQL real y auditoría con cobertura 74.32 %. |
| T095 | PASS | Provider/consumer y E2E real Bookings→Accommodations con PostgreSQL 16 y JWT RS256 de servicio. |
| T097 | PASS | Gateway y Bookings reales; rutas, JWT delegado, roles, trazas, Problem Details y rate limits aprobados verificados 4/4. |
| T096a | PASS | Cliente REST de Bookings probado contra Payments real con PostgreSQL 16 y RabbitMQ: cobro aprobado + replay, rechazo autoritativo y refund completado + replay; 3/3 escenarios E2E. |
| T096b | PASS | E2E distribuido real con PostgreSQL, RabbitMQ y HTTP: `npm run test:unir:e2e`; 8/8 escenarios PASS, incluidos quote real, replay, rechazo, retry, caída/recuperación, reinicio, Reviews y refund. |
| T098 | PASS | E2E real Bookings↔Reviews: elegibilidad REST, check-in/out, creación de reseña, duplicado 409 y no completada 404 sin compartir DB. Incluido en `npm run test:unir:e2e`; 8/8 escenarios PASS. |

## 2. Evidencia real ejecutada

Entorno: PostgreSQL 16.15 local efímero, base `bookings_test`.

- `npm run prisma:bookings:migrate:deploy`: aplicadas `001_bookings_core`, `002_booking_lifecycle_fields` y `003_payment_review_and_notification_work` sobre PostgreSQL 16 limpio.
- `npm run test:bookings:unit`: 13 suites, 90 pruebas aprobadas.
- `npm run test:bookings:contract`: 13 suites, 88 pruebas aprobadas.
- `npm run test:bookings:integration` con PostgreSQL y RabbitMQ reales: 9 suites, 44 pruebas aprobadas.
- `npm run test:bookings:concurrency`: 1 suite, 2 pruebas aprobadas (GiST sin sobreventa).
- `npm run test:e2e --workspace @stayhub/bookings-service`: E2E aislado sobre PostgreSQL real.
- `npm run test:unir:e2e`: 8/8 escenarios E2E reales PASS (Accommodations→Bookings→Payments→Notifications + Bookings↔Reviews).
- `npm run test:gateway:bookings:e2e`: 4/4 escenarios PASS con Gateway/Bookings/PostgreSQL/Redis reales; escritura 11 y lectura 61 por usuario devuelven `429` y `Retry-After`.
- Notifications: `typecheck`, `lint`, `build`, 23 suites/58 pruebas y validador OpenAPI PASS; migración `202611100001_booking_reminder_canonical_fields` aplicada sobre PostgreSQL limpio.
- `node scripts/validate-bookings-contracts.mjs`: OpenAPI y JSON Schema válidos.
- `typecheck`, `lint` y `build` de Bookings: exit `0`.

## 3. Cobertura funcional

- **RQ-07**: alta idempotente, quote contractual, snapshot, GiST sin sobreventa, saga de pago y expiración de hold.
- **RQ-08**: historial OWNER con filtros, paginación y aislamiento multi-owner.
- **RQ-09**: cancelación GUEST con política versionada, decisión auditada y refund work.
- **RQ-10**: cancelación OWNER con justificación obligatoria y refund `FULL`.
- **RQ-11 parcial**: check-out publica `booking.v1.completed` y endpoint interno de elegibilidad con scope separado.

## 4. Contratos y operación

- OpenAPI y JSON Schema versionados; drift generado↔fuente en `openapi-drift.spec.ts`.
- Handoff Reviews congelado en `test/fixtures/REVIEWS-HANDOFF.md`.
- Compose añade `bookings-db`, `bookings-migrate`, `bookings-rabbitmq` y `bookings-service` con `restart: always`, healthchecks, `read_only`, `cap_drop` y `no-new-privileges`.
- CI añade job `bookings-quality` con PostgreSQL real, migraciones, gates y build de imagen.

## 5. Correcciones relevantes

- Se corrigió la redacción de logs (`BookingsLogger`): la implementación previa construía entradas inválidas y dejaba el payload vacío; ahora redacta `authorization/token/password/secret/email/phone`.
- Migración `002_booking_lifecycle_fields` añade columnas de cancelación y check-in/out que faltaban del data model.
- `jest.config.ts` reconoce `*.e2e-spec.ts` para ejecutar el E2E aislado.
- El E2E real descubrió y corrigió que el pipe global del Gateway rechazaba parámetros de ruta/query y que check-in/out devolvían `201` en vez del `200` contractual.

## 6. Cierre de Sprint 3 backend

T095, T096a, T096b, T097 y T098 quedaron validadas contra colaboradores reales dentro de su
frontera. Los recursos temporales se eliminaron al terminar y el handoff contractual de Reviews
permanece congelado. El aprovisionamiento del `.env` integral y sus secretos continúa siendo una
responsabilidad operativa separada, no un faltante funcional de T097.
