# Implementation Plan: Reviews Service de StayHub

**Branch context**: `reviews_service` (Spec Kit); checkout actual `search_service`  
**Date**: 2026-11-05  
**Spec**: `specs/003-reservas-pagos-resenas/reviews_service/spec.md`  
**Input**: RQ-11, contribución parcial a RQ-06, Sprint 3, constitución 1.0.0 y handoff contractual de `booking_service`.

## Summary

Implementar `reviews-service` como microservicio NestJS en el puerto interno 3007, dueño exclusivo de reseñas en PostgreSQL mediante Prisma. Un huésped crea una reseña inmutable con calificación 1–5 y comentario después de que una llamada REST autenticada a `bookings-service` confirme que `bookingId + guestId` corresponde a una estadía `COMPLETED`. El servicio ofrece consultas paginadas por propiedad y por usuario propio, aplica unicidad por reserva, no accede a bases ajenas y no incorpora Redis ni RabbitMQ en este incremento.

## Implementation Progress

- **Corte implementado**: T001–T037 (37/74), correspondiente a Setup, Foundation y especificaciones TDD iniciales de US1.
- **Validación verde del corte implementado**: lint, typecheck, build, 30 unitarias de Foundation, 7 de contrato, 3 de integración estructural/health y 5 de seguridad JWT.
- **Estado TDD de US1**: seis pruebas permanecen rojas y 19 escenarios están pendientes hasta implementar T038–T045; RQ-11 todavía no se declara funcional.
- **Límite de evidencia**: Compose valida sintácticamente, pero PostgreSQL/contenedores no se ejecutaron en este corte porque el daemon Docker no estaba disponible.

## Technical Context

**Language/Version**: Node.js 20, TypeScript 5.7 estricto  
**Primary Dependencies**: NestJS 10.4, Prisma 6.19, `@nestjs/swagger`, `class-validator`, `jose`, OpenTelemetry  
**Storage**: PostgreSQL 16 exclusivo de Reviews; sin Redis  
**Communication**: REST síncrono hacia Bookings; sin consumidor RabbitMQ en el incremento inicial  
**Testing**: Jest 29, Supertest, PostgreSQL real, Swagger parser/AJV, contrato, seguridad, concurrencia, rendimiento y Compose  
**Target Platform**: contenedor Linux Node 20 no-root, Docker Compose  
**Project Type**: microservicio backend en monorepo npm workspaces  
**Performance Goals**: p95 < 500 ms para consultas; errores inesperados < 1 %  
**Constraints**: cobertura >= 70 %; puerto 3007; una reseña por reserva; fail-closed ante Bookings; sin DB compartida  
**Scale/Scope**: tres operaciones públicas vía Gateway, un contrato consumidor, una tabla principal y paginación máxima 100

## Constitution Check

*GATE previo a investigación y revalidado después del diseño.*

| Principio | Estado | Evidencia del plan |
|---|---|---|
| I. Dominio por microservicio | PASS | Reviews posee reseñas; Bookings conserva estadías y Accommodations propiedades. |
| II. Capas y dependencias | PASS | Dominio puro, casos por puertos y adaptadores Nest/Prisma/HTTP. |
| III. Datos independientes | PASS | `reviews_db`; IDs externos sin FK; elegibilidad por REST. |
| IV. Comunicación explícita | PASS | La decisión inmediata usa REST; no se añade mensajería eventual innecesaria. |
| V. Seguridad | PASS | JWT usuario, service JWT Reviews→Bookings, ownership y fail-closed. |
| VI. Código modular tipado | PASS | TypeScript strict, módulos cohesivos y fronteras verificadas. |
| VII. Contratos documentados | PASS | OpenAPI propio y consumer contract de Bookings con drift tests. |
| VIII. Verificación/trazabilidad | PASS | RQ-11/RQ-06 parcial mapeados a pruebas completas. |

No existen excepciones. Bookings permite planificación con stubs; la integración real depende de T079–T088 y su handoff provider.

## Project Structure

### Documentation

```text
specs/003-reservas-pagos-resenas/reviews_service/
├── spec.md
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
├── contracts/
│   ├── openapi-reviews-service.yaml
│   └── openapi-bookings-review-eligibility-consumer.yaml
└── tasks.md                 # futuro output de $speckit-tasks
```

### Source Code previsto

```text
apps/reviews-service/
├── prisma/
│   ├── migrations/
│   └── schema.prisma
├── src/
│   ├── domain/reviews/
│   ├── domain/shared/
│   ├── application/
│   │   ├── create-review/
│   │   ├── list-property-reviews/
│   │   ├── list-user-reviews/
│   │   ├── errors/
│   │   └── ports/
│   ├── infrastructure/
│   │   ├── config/
│   │   ├── http/
│   │   ├── observability/
│   │   ├── persistence/prisma/
│   │   └── security/
│   ├── interfaces/http/
│   ├── interfaces/openapi/
│   ├── modules/health/
│   ├── modules/reviews/
│   ├── app.module.ts
│   └── main.ts
└── test/
    ├── unit/
    ├── integration/
    ├── contract/
    ├── security/
    ├── concurrency/
    ├── performance/
    └── e2e/

infra/docker/reviews/Dockerfile
```

**Structure Decision**: arquitectura hexagonal pragmática coherente con Auth, Users y Search. Dominio/aplicación no importan NestJS, Prisma o HTTP; infraestructura implementa puertos y `modules/` compone dependencias.

## 1. Límite y responsabilidades

Reviews posee `Review`, rating/comentario, unicidad por `bookingId`, persistencia, paginación, presenters seguros, autorización e integración de elegibilidad.

No posee estados de reserva, usuarios, perfiles, propiedades, habitaciones, pagos, notificaciones, moderación, frontend, agregados estadísticos, edición ni eliminación.

## 2. Arquitectura por capas

### 2.1 Dominio

- `Review`: agregado inmutable con `id`, `bookingId`, `propertyId`, `guestId`, `rating`, `comment`, `createdAt`.
- `Rating`: entero 1..5.
- `ReviewComment`: Unicode, trim en extremos, no vacío, máximo 2.000 caracteres.
- Una reseña por `bookingId`; PostgreSQL impone la garantía final.
- Sin decoradores, DTOs, Prisma, HTTP o JWT.

### 2.2 Aplicación

- `CreateReviewUseCase`: consulta `StayEligibilityPort`, construye y persiste.
- `ListPropertyReviewsUseCase`: página pública sin identidad del huésped.
- `ListOwnReviewsUseCase`: exige coincidencia principal–`userId`.
- Puertos: `ReviewRepository`, `ReviewUnitOfWork`, `StayEligibilityPort`, `ClockPort`, `IdGeneratorPort`.
- Fallos externos se traducen a errores estables sin filtrar detalles remotos.

### 2.3 Infraestructura e interfaces

- Prisma/PostgreSQL implementa repositorio/UoW.
- `BookingsReviewEligibilityClient` usa REST, service JWT, timeout y `traceId`.
- Verificadores separados para bearer usuario y credencial Gateway.
- Configuración fail-fast, logs, métricas, OTEL y health.
- Controllers solo traducen; DTOs son cerrados; guards preceden dominio; Problem Details conserva `traceId`; Swagger se compara con contrato.

## 3. Flujos técnicos

### 3.1 Crear reseña

1. Gateway autentica y reenvía bearer validado y `traceId`.
2. Reviews valida RS256, issuer, audience, expiración, sesión y rol `GUEST`.
3. DTO acepta solo `bookingId`, `rating`, `comment`.
4. El caso consulta `GET /internal/v1/bookings/{bookingId}/review-eligibility?guestId={sub}` con service JWT.
5. Bookings devuelve `bookingId`, `guestId`, `propertyId`, `eligible`.
6. No elegible, mismatch, timeout o 5xx no persisten; indisponibilidad produce 503.
7. Se inserta en transacción corta, nunca abierta durante HTTP externo.
8. UNIQUE `bookingId` resuelve concurrencia y se mapea a `REVIEW_ALREADY_EXISTS`.
9. La respuesta omite `guestId`, `bookingId` y datos de reserva.

### 3.2 Consultar por propiedad

- Gateway usa credencial de servicio hacia Reviews.
- Reviews valida UUID/paginación; no consulta Accommodations por una lista vacía.
- Orden `createdAt DESC, id DESC`; `pageSize` 1..100.
- Presenta `id`, `propertyId`, `rating`, `comment`, `createdAt`.

### 3.3 Consultar historial propio

- Gateway reenvía bearer; Reviews exige `principal.sub === path.userId`.
- Usuario ajeno recibe 403 antes de persistencia.
- Se aplica la misma paginación/proyección segura.

## 4. Contratos HTTP

Contrato fuente: `contracts/openapi-reviews-service.yaml`.

| Método | Ruta interna | Actor | Uso |
|---|---|---|---|
| POST | `/internal/v1/reviews` | GUEST | Crear reseña para reserva completada. |
| GET | `/internal/v1/properties/:propertyId/reviews` | Gateway | Listar reseñas públicas. |
| GET | `/internal/v1/reviews/user/:userId` | Usuario propio | Listar reseñas propias. |

Gateway conserva las rutas de `tendencias.md`: `POST /reviews`, `GET /properties/:id/reviews`, `GET /reviews/user/:id`, normalmente bajo `/api/v1`. El routing es dependencia externa.

Consumer contract: `contracts/openapi-bookings-review-eligibility-consumer.yaml`. Antes de integrar se congelan audience/scope, `eligible=false` frente a 404, 403/503, schemas cerrados y fixture T081/T088.

## 5. Persistencia y concurrencia

- `reviews_db`; IDs externos sin FK remota.
- Prisma 6.19, migraciones SQL y `migrate deploy`; nunca `db push` runtime.
- UNIQUE `bookingId`; índices `(propertyId, createdAt DESC, id DESC)` y `(guestId, createdAt DESC, id DESC)`.
- CHECK `rating BETWEEN 1 AND 5`; comentario Unicode acotado.
- SQL crudo solo en migración/adaptador y parametrizado.
- Sin update/delete.

## 6. Seguridad

- Bearer usuario: RS256, `kid`, issuer/audience, `iat/exp`, `sub/sid/jti` UUID y rol.
- Service JWT Reviews→Bookings: sujeto `reviews-service`, audiencia Bookings, TTL corto y scope exclusivo; se recibe por secret file mediante un `ServiceTokenPort`, siguiendo el patrón saliente actual de Bookings.
- Cliente no suministra `guestId/propertyId`; se rechaza spoofing de identidad.
- Precedencia 401 → 403 → existencia/conflicto.
- DTO `additionalProperties: false`; rating entero y comentario acotado.
- Logs sin JWT, headers, comentario completo, payload remoto o PII innecesaria.
- Secretos `_FILE`, red interna, no-root y filesystem read-only cuando sea viable.

## 7. Configuración e infraestructura

Variables mínimas:

- `REVIEWS_PORT=3007`, entorno y nivel de log.
- `REVIEWS_DATABASE_URL_FILE`.
- claves/issuer/audience de JWT usuario y Gateway.
- `REVIEWS_BOOKINGS_SERVICE_TOKEN_FILE` para la credencial corta emitida externamente con audience/scope de Bookings; Reviews no conserva una clave privada de firma propia.
- `REVIEWS_BOOKINGS_BASE_URL`, timeout/circuit breaker.
- configuración OTEL.

Docker incluye `reviews-db` PostgreSQL 16, `reviews-migrate` one-shot y `reviews-service` Node 20 no-root. Puerto 3007 solo interno. Reviews no recibe `restart: always` obligatorio: el documento lo reserva para Auth, Bookings y Payments.

## 8. Observabilidad y operación

- `/health/live`: proceso activo sin depender de externos.
- `/health/ready`: configuración, migraciones y DB; Bookings se reporta sin habilitar bypass.
- Logs JSON con operación, ruta, estado, duración, IDs seguros, `traceId` y dependencia.
- Métricas de endpoint, creación/rechazo/duplicado y llamadas a Bookings.
- Trazas Gateway→Reviews→Bookings y Reviews→PostgreSQL.
- Shutdown deja de aceptar tráfico y desconecta Prisma.

## 9. Estrategia de pruebas

### Unitarias

- Rating, comentario, agregado y duplicidad.
- Casos elegible, no completada, mismatch y Bookings caído.
- Ownership y presenters sin IDs privados.

### Integración

- Migración/constraints en PostgreSQL real.
- Repositorio, paginación, orden e índices.
- Dos creaciones concurrentes: exactamente una fila.
- Cliente Bookings con stub: true/false, 401/403/404/timeout/5xx y payload inválido.

### Contrato y seguridad

- OpenAPI propio sin drift.
- Consumer contract y fixture provider T081/T088.
- Problem Details, DTOs cerrados, JWT adversarial, spoofing e historial ajeno.

### Rendimiento y E2E

- Dataset reproducible; p95 <500 ms y error inesperado <1 %.
- E2E aislado con Gateway/Bookings stubs y PostgreSQL real.
- E2E real después de T079–T088/T098 y routing Gateway.

## 10. Dependencias y paralelización

```text
Spec + contratos Reviews
├── workspace/config/Docker
├── dominio + puertos + unit tests
└── Prisma/migraciones + integration harness

Dominio + DB
├── create review + concurrencia
├── listado por propiedad
└── historial propio

Contrato Bookings
├── consumer stub desde el inicio
├── fixture T081/T088 para provider tests
└── servicios reales para E2E T098
```

| Dependencia | Permite con stub | Bloquea evidencia real |
|---|---|---|
| Bookings T079–T088 | Cliente/casos de uso | Provider test y creación real |
| Gateway routing/JWT | Controllers directos | E2E público |
| Compose conjunto | Imagen individual | Flujo distribuido completo |

## 11. Mensajería

No se incorpora RabbitMQ. `POST /reviews` necesita decisión inmediata y usa REST. `booking.v1.completed` queda para una proyección futura; adoptarlo exigiría consumidor concreto, routing/DLQ, Inbox y pruebas, sin eliminar revalidación REST.

Reviews tampoco publica `review.created.v1` hasta que exista un consumidor aprobado; entonces deberá usar Outbox junto con Review.

## 12. Estimación

`tendencias.md` asigna 10 horas al sistema de reseñas/calificaciones. Se conserva como referencia funcional, no como promesa para toda la ingeniería. Contratos, seguridad, Docker, observabilidad e integración se detallarán en `tasks.md`, sin atribuir horas completas de Bookings/Gateway.

## 13. Trazabilidad

| Requisito | Componentes | Evidencia mínima |
|---|---|---|
| RQ-11 | CreateReview, Rating, eligibility, UNIQUE bookingId | unit + concurrency + consumer/provider + E2E |
| RQ-06 parcial | ListPropertyReviews/presenter | contract + integration + performance |
| Consulta por usuario | ListOwnReviews/ownership | security + contract + integration |
| RNF | JWT, DTO, errores, logs, Docker | security + Compose + OpenAPI drift |

## 14. Constitution Check posterior al diseño

Todos los principios permanecen **PASS**: no hay DB/import compartido; REST sirve la decisión inmediata; RabbitMQ/Redis se excluyen por falta de necesidad; capas, contratos, seguridad, pruebas y trazabilidad son explícitos; RQ-06 permanece parcial y no se agregan edición/moderación.

## 15. Criterios técnicos de terminado

- Spec, plan, modelo y contratos aprobados y sin drift.
- Workspace/CI/build/lint/typecheck operativos con Node 20.
- Migraciones reproducibles; UNIQUE/CHECK probados bajo concurrencia.
- RQ-11 tiene pruebas positivas, negativas, autorización y fallo externo.
- Tres operaciones cumplen paginación, DTO y Problem Details.
- Bookings se consume por REST con timeout, service JWT y fail-closed.
- Cobertura >=70 %, p95 <500 ms y error inesperado <1 %.
- Compose levanta DB/migración/Reviews; contenedor no-root y shutdown limpio.
- RQ-06 se declara parcial y no se afirma integración antes de ejecutarla.
- Revisión humana confirma constitución, alcance y datos seguros.

## Complexity Tracking

No aplica: no existen violaciones constitucionales que justificar.
