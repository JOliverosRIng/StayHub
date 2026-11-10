# Validation Report — bookings-service (Sprint 3)

**Fecha**: 2026-11-06
**Alcance**: RQ-07, RQ-08, RQ-09, RQ-10 y contribución parcial a RQ-11.
**Estado**: núcleo técnico completo y validado con PostgreSQL real; solo quedan las integraciones externas reales.

## 1. Tareas

| Rango | Estado | Nota |
|---|---|---|
| T001–T094 | Completadas | Setup, Foundation, US1–US5, gates de contratos/seguridad/rendimiento y E2E aislado. |
| T078 | Completada | Evidencia PostgreSQL real de US4/US5 registrada en `quickstart.md`. |
| T099 | Completada | Shutdown ordenado y contrato de contenedor. |
| T100–T101 | Completadas | Quickstart ejecutado con PostgreSQL real y auditoría con cobertura 74.32 %. |
| T095–T098 | Pendientes | Integraciones externas Accommodations, Payments, Gateway y Reviews. |

## 2. Evidencia real ejecutada

Entorno: PostgreSQL 16.15 local efímero, base `bookings_test`.

- `npm run prisma:bookings:migrate:deploy`: aplicadas `001_bookings_core` y `002_booking_lifecycle_fields`.
- `npm run test:bookings:integration`: 7 suites, 26 pruebas aprobadas.
- `npm run test:bookings:concurrency`: 1 suite, 2 pruebas aprobadas (GiST sin sobreventa).
- `npm run test:e2e --workspace @stayhub/bookings-service`: 1 suite, 2 pruebas aprobadas.
- `npm run test:performance --workspace @stayhub/bookings-service`: 1 suite, 2 pruebas aprobadas.
- `npm run test:bookings`: 35 suites, 184 pruebas aprobadas, 0 fallidas.
- `npm run test:coverage --workspace @stayhub/bookings-service`: statements 74.32 %, branches 76.79 %, functions 75.82 %, lines 79.92 % (umbral 70 % cumplido).
- `node scripts/validate-bookings-contracts.mjs`: OpenAPI y JSON Schema válidos.
- `typecheck`, `lint` y `build`: exit `0`.

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

## 6. Pendiente antes de declarar Sprint 3 cerrado

Solo integraciones externas reales:

1. T095 Gateway ↔ Bookings.
2. T096 Bookings ↔ Accommodations quote real.
3. T097 Bookings ↔ Payments y eventos reales.
4. T098 Bookings ↔ review_service consumer.

No se ejecutó `docker compose` ni RabbitMQ real por falta de Docker en el entorno local; esa evidencia queda explícitamente diferida. El handoff contractual de Reviews está congelado y no requiere cambios internos de Bookings.
