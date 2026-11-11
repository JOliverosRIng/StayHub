# reviews-service

Microservicio NestJS de StayHub para RQ-11 (calificar una propiedad tras una estadía
completada) y para la contribución parcial de reseñas a RQ-06. Es dueño exclusivo de
`reviews_db`, escucha internamente en el puerto `3007` y valida la elegibilidad de una estadía
mediante el contrato REST publicado por `bookings-service`.

## Responsabilidades y límites

Posee:

- La entidad inmutable `Review` con calificación 1–5 y comentario acotado.
- La unicidad de una reseña por `bookingId`.
- Las consultas paginadas por propiedad y por historial propio.
- La autorización por rol/ownership y la integración de elegibilidad con Bookings.

No administra reservas, propiedades, usuarios, pagos, moderación, edición ni eliminación. No
usa Redis ni RabbitMQ en este incremento, no accede a bases de otros servicios y no declara
completa la ficha de propiedad de RQ-06.

## Endpoints internos

| Método | Ruta | Actor | Uso |
|---|---|---|---|
| POST | `/internal/v1/reviews` | GUEST (bearer) | Crear reseña de una estadía `COMPLETED`. |
| GET | `/internal/v1/properties/:propertyId/reviews` | Gateway (service JWT) | Listar reseñas públicas. |
| GET | `/internal/v1/reviews/user/:userId` | Usuario propio (bearer) | Listar el historial propio. |
| GET | `/health/live`, `/health/ready` | Operación | Liveness y readiness. |

La respuesta de reseña expone solo `id`, `propertyId`, `rating`, `comment` y `createdAt`; nunca
`guestId` ni `bookingId`.

## Arquitectura

Arquitectura hexagonal pragmática, coherente con Auth, Users, Search y Bookings:

```text
src/
├── domain/reviews/                 # Review, Rating, ReviewComment, ReviewPage, ownership
├── application/
│   ├── create-review/              # CreateReviewUseCase
│   ├── list-property-reviews/      # ListPropertyReviewsUseCase
│   ├── list-user-reviews/          # ListOwnReviewsUseCase
│   └── ports/                      # repositorio, UoW, elegibilidad, token, clock, ids
├── infrastructure/
│   ├── config/                     # configuración tipada fail-fast
│   ├── http/                       # cliente REST a Bookings y mapper
│   ├── lifecycle/                  # graceful shutdown
│   ├── observability/              # logs JSON, métricas, OTEL
│   ├── persistence/prisma/         # repositorio/UoW y Prisma
│   └── security/                   # verificadores JWT de usuario y servicio
├── interfaces/
│   ├── http/                       # controllers, DTOs, guards, presenters, filtros
│   └── openapi/                    # Swagger
└── modules/                        # composición NestJS (reviews, shared, health)
```

El dominio y la aplicación no importan NestJS, Prisma ni HTTP.

## Configuración

Copiar `.env.example` a un archivo local ignorado y suministrar secretos por archivos. Nunca
versionar credenciales.

Variables principales:

- `REVIEWS_PORT=3007`
- `REVIEWS_DATABASE_URL_FILE` (o `REVIEWS_DATABASE_URL` en local)
- `REVIEWS_USER_JWT_PUBLIC_KEYS_JSON`, `REVIEWS_USER_JWT_ISSUER`, `REVIEWS_USER_JWT_AUDIENCE`
- `REVIEWS_GATEWAY_JWT_PUBLIC_KEYS_JSON`, `REVIEWS_GATEWAY_JWT_ISSUER`,
  `REVIEWS_GATEWAY_JWT_AUDIENCE`, `REVIEWS_GATEWAY_JWT_SCOPE`
- `REVIEWS_BOOKINGS_BASE_URL`, `REVIEWS_BOOKINGS_TIMEOUT_MS`
- `REVIEWS_BOOKINGS_SERVICE_TOKEN_FILE`
- `REVIEWS_SHUTDOWN_GRACE_MS`, `REVIEWS_LOG_LEVEL`, `OTEL_EXPORTER_OTLP_ENDPOINT`

## Operación local

```bash
npm ci
npm run prisma:reviews:generate
npm run prisma:reviews:migrate:deploy
npm run lint:reviews
npm run typecheck:reviews
npm run build:reviews
```

Para pruebas de integración, concurrencia, rendimiento y E2E se requiere PostgreSQL real y
`REVIEWS_TEST_DATABASE_URL`:

```bash
REVIEWS_TEST_DATABASE_URL='postgresql://reviews:reviews@127.0.0.1:55434/reviews_db?schema=public' \
  npm run test:reviews:integration
```

## Migraciones

`prisma migrate deploy` aplica `001_reviews_core`, que crea:

- PK `id`, UNIQUE `bookingId`, CHECK `rating BETWEEN 1 AND 5` y comentario trim 1..2000.
- Índices `(propertyId, createdAt DESC, id DESC)` y `(guestId, createdAt DESC, id DESC)`.
- Sin claves foráneas remotas, sin `updatedAt`, `deletedAt` ni `status`.

Nunca se usa `db push` en runtime.

## Contratos

Los contratos fuente viven en
`specs/003-reservas-pagos-resenas/reviews_service/contracts/`:

- `openapi-reviews-service.yaml` (API propia).
- `openapi-bookings-review-eligibility-consumer.yaml` (consumo de Bookings).

Verificación:

```bash
npm run openapi:reviews:check
```

El script `scripts/validate-reviews-contracts.mjs` valida OpenAPI 3.1, operaciones esperadas y
schemas cerrados; `openapi-drift.spec.ts` compara el Swagger generado con la fuente.

## Seguridad

- Access bearer RS256 con `kid`, issuer, audience, `exp`/`iat`, `sub`/`sid`/`jti` UUID y rol.
- Service JWT de Gateway con issuer, audience y scope `reviews:read`.
- Service JWT saliente hacia Bookings con token montado por archivo; fail-closed si falta.
- DTOs cerrados (`forbidNonWhitelisted`) y validación de UUID/paginación sin coerción laxa.
- Precedencia 401 → 403 → existencia/conflicto antes de tocar la base.
- Problem Details con código estable y `traceId`; logs sin JWT, comentario completo ni PII.
- Contenedor no-root, filesystem read-only, secrets por archivo y shutdown ordenado.

## Observabilidad y salud

- `/health/live`: proceso activo sin dependencias externas.
- `/health/ready`: configuración, migraciones y DB. Bookings se reporta sin habilitar bypass.
- Logs JSON con redacción, métricas base y trazas OTEL con propagación de `x-request-id`.

## Pruebas

```bash
npm run test:reviews:unit
npm run test:reviews:contract
npm run test:reviews:security
npm run test:reviews:concurrency
npm run test:reviews:integration
npm run test:reviews:performance
npm run test:reviews:e2e
npm run test:reviews:coverage
```

Cobertura de referencia del corte actual: statements 89.73 %, branches 81.67 %,
functions 84.69 %, lines 92.14 %, por encima del mínimo de 70 %.

## Docker Compose

- Compose aislado: `docker-compose.reviews.yml` (`reviews-db`, `reviews-migrate`,
  `reviews-service`).
- Compose raíz: servicios `reviews-db`, `reviews-migrate`, `reviews-service` con
  `reviews-internal` y `services`.

```bash
docker compose -f docker-compose.reviews.yml config
docker compose --env-file .env.example -f docker-compose.yml config -q
```

## Gates externos y estado

- **T069 completada**: consumer/provider y E2E real Bookings↔Reviews ejecutados con bases
  aisladas y service JWT `reviews:eligibility`; harness en
  `test/e2e/bookings-reviews.e2e-spec.ts`.
- **Verificación conjunta actual**: `npm run test:unir:e2e` (8/8 PASS) levanta Bookings, Reviews,
  Payments, Notifications, PostgreSQL y RabbitMQ reales; incluye creación de reseña, duplicado
  `409` y reserva no completada `404`.
- **T070 bloqueada**: el API Gateway todavía no implementa routing/cliente de Reviews; el
  harness queda en `test/e2e/gateway-reviews.e2e-spec.ts`.

La evidencia Bookings↔Reviews ya es no simulada. El Sprint 3 distribuido completo no se declara
cerrado hasta implementar y ejecutar el gate de Gateway y completar la revisión humana/CI.
