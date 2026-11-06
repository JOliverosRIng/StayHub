# Validation Report — bookings-service (Sprint 3)

**Fecha**: 2026-11-06
**Alcance**: RQ-07, RQ-08, RQ-09, RQ-10 y contribución parcial a RQ-11.
**Estado**: núcleo técnico implementado; cierre end-to-end y evidencia PostgreSQL real pendientes.

## 1. Tareas

| Rango | Estado | Nota |
|---|---|---|
| T001–T077 | Completadas | Setup, Foundation, US1–US4. |
| T079–T094 | Completadas | US5, gates de contratos, seguridad, rendimiento y E2E aislado escritos. |
| T099 | Completada | Shutdown ordenado y contrato de contenedor. |
| T078 | Pendiente | Evidencia PostgreSQL real de US4/US5; requiere DB. |
| T095–T098 | Pendientes | Integraciones externas Accommodations, Payments, Gateway y Reviews. |
| T100–T101 | Pendientes | Evidencia real de quickstart y auditoría final con cobertura. |

## 2. Evidencia local ejecutada

- `npm run typecheck:bookings`: exit `0`.
- `npm run lint:bookings`: exit `0`.
- `npm run build:bookings`: exit `0`.
- `node scripts/validate-bookings-contracts.mjs`: OpenAPI válido, operaciones requeridas y JSON Schema válido.
- `npm run test:bookings`: 141 pruebas aprobadas, 22 omitidas (integración/E2E/rendimiento dependientes de PostgreSQL).
- `npm run test:coverage --workspace @stayhub/bookings-service`: 53.14 % statements local porque las pruebas de integración/UoW se omiten sin `BOOKINGS_TEST_DATABASE_URL`; el job CI las ejecuta con PostgreSQL.

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

## 6. Pendientes antes de declarar Sprint 3 cerrado

1. Ejecutar T078 con PostgreSQL 16 real y registrar salida de `owner-history.spec.ts`, `guest-cancellation.spec.ts` y `stay-lifecycle.spec.ts`.
2. Ejecutar E2E aislado y rendimiento contra PostgreSQL real (CI o entorno local con Docker).
3. Integrar Accommodations quote, Payments, Gateway y review_service reales (T095–T098).
4. Ejecutar `quickstart.md` completo y registrar evidencia real (T100).
5. Verificar cobertura >=70 % con integraciones activas y revisión humana (T101).

No se declara integración end-to-end mientras estos puntos sigan abiertos.
