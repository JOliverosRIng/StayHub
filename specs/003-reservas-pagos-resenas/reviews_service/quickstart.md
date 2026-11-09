# Quickstart de validación: reviews-service

Esta guía define evidencia esperada. No afirma que Reviews o Bookings estén implementados.

## 1. Prerrequisitos

- Node.js 20 y npm del lockfile raíz.
- Docker Desktop/Compose y PostgreSQL 16.
- Provider stub compatible con `contracts/openapi-bookings-review-eligibility-consumer.yaml`.
- Claves de desarrollo no productivas para JWT usuario, Gateway y Reviews→Bookings.

## 2. Configuración mínima

Crear archivo local ignorado por Git a partir del futuro `.env.example`; nunca versionar secretos.

```text
REVIEWS_PORT=3007
REVIEWS_DATABASE_URL_FILE=/run/secrets/reviews_database_url
REVIEWS_BOOKINGS_BASE_URL=http://bookings-service:3005
REVIEWS_BOOKINGS_TIMEOUT_MS=1500
REVIEWS_USER_JWT_ISSUER=stayhub-auth
REVIEWS_USER_JWT_AUDIENCE=stayhub-api
REVIEWS_BOOKINGS_SERVICE_TOKEN_FILE=/run/secrets/reviews_bookings_service_token
```

Los nombres definitivos se congelan al generar tareas y `.env.example`.

## 3. Gates estáticos

```powershell
npm ci
npm run prisma:reviews:generate
npm run lint:reviews
npm run typecheck:reviews
npm run build:reviews
```

Esperado: exit 0 y sin imports Nest/Prisma/HTTP desde `src/domain`.

## 4. Migración

```powershell
npm run prisma:reviews:migrate:deploy
```

Verificar tabla desde base vacía, `bookingId` único, CHECKs, índices y segunda ejecución idempotente.

## 5. Crear reseña elegible

Preparar respuesta elegible de Bookings y ejecutar `POST /internal/v1/reviews` con bearer GUEST.

Esperado: 201; `propertyId` viene de Bookings; respuesta solo contiene `id`, `propertyId`, `rating`, `comment`, `createdAt`; una fila y `traceId` propagado.

## 6. Rechazos

Comprobar cero filas nuevas para:

- rating 0, 6, decimal o string;
- comentario vacío, espacios o >2.000;
- campos desconocidos, `guestId` o `propertyId` en body;
- JWT ausente/inválido/expirado o rol OWNER/ADMIN;
- `eligible=false`, 404 o IDs distintos;
- timeout, conexión rechazada o 5xx de Bookings;
- segundo intento para el mismo `bookingId`.

## 7. Concurrencia

Enviar dos creaciones simultáneas para el mismo `bookingId`. Debe existir exactamente una fila; una respuesta creada y otra conflicto seguro, sin stack/SQL.

## 8. Consultas

- Propiedad con reseñas: orden y paginación deterministas.
- Sin reseñas: 200 con `items=[]`.
- `pageSize >100`, UUID inválido o página 0: 400.
- Historial propio: 200; usuario ajeno: 403.
- Ninguna respuesta expone `guestId`/`bookingId`.

## 9. Suites previstas

```powershell
npm run test:reviews:unit
npm run test:reviews:integration
npm run test:reviews:contract
npm run test:reviews:security
npm run test:reviews:concurrency
npm run test:reviews:performance
npm run test:reviews:coverage
```

Esperado: verdes, cobertura >=70 %, OpenAPI sin drift, p95 <500 ms y error inesperado <1 % con entorno registrado.

## 10. Docker

```powershell
docker compose up -d reviews-db reviews-migrate reviews-service
docker compose ps
```

Comprobar live/ready, no-root, secretos por archivo, puerto interno 3007, filesystem read-only cuando sea viable y SIGTERM limpio.

## 11. Handoff con Bookings

Antes de declarar integración real:

1. Bookings completa T079–T088.
2. Se compara consumer contract con provider OpenAPI.
3. Se ejecutan fixtures `REVIEWS-HANDOFF` y provider tests.
4. Se valida scope/audience, true/false, 401/403/404/503 y no-disclosure.
5. Se ejecuta E2E Bookings↔Reviews previsto por T098.

Hasta entonces, reportar integración contra stub/contrato, no Sprint 3 end-to-end.

## 12. Evidencia ejecutada (2026-11-08)

Entorno: Node 22 (lockfile raíz), podman 5.8 y PostgreSQL 16-alpine efímero en
`127.0.0.1:55432/reviews_test`. Comandos ejecutados con
`REVIEWS_TEST_DATABASE_URL=postgresql://reviews_test:reviews_test@localhost:55432/reviews_test?schema=public`.

| Escenario | Comando | Resultado |
|---|---|---|
| Dependencias | `npm ci` | exit 0 |
| Cliente Prisma | `npm run prisma:reviews:generate` | exit 0 |
| Migración | `npm run prisma:reviews:migrate:deploy` | `001_reviews_core` aplicada |
| Estáticos | `npm run lint:reviews && npm run typecheck:reviews && npm run build:reviews` | exit 0 |
| Unitarias | `npm run test:reviews:unit` | 45 aprobadas |
| Contrato | `npm run test:reviews:contract` | 45 aprobadas |
| Seguridad | `npm run test:reviews:security` | 18 aprobadas |
| Integración | `npm run test:reviews:integration` | 22 aprobadas |
| Concurrencia | `npm run test:reviews:concurrency` | 1 aprobada (una sola fila por `bookingId`) |
| Rendimiento | `npm run test:reviews:performance` | 2 aprobadas, p95 < 500 ms |
| E2E aislado | `npm run test:reviews:e2e` | 2 aprobadas; Bookings/Gateway omitidos sin variables |
| E2E real Bookings | `npm run test:reviews:e2e -- --runTestsByPath test/e2e/bookings-reviews.e2e-spec.ts` | 1 aprobada contra Bookings real, PostgreSQL propio y service JWT RS256 |
| Contratos | `npm run openapi:reviews:check` | OpenAPI válido y sin drift |
| Cobertura | `npm run test:reviews:coverage` | statements 89.73 %, branches 81.67 %, functions 84.69 %, lines 92.14 % |
| Compose | `docker compose --env-file .env.example config -q` | exit 0 |

Evidencia **contra stub/PostgreSQL real**: creación, rechazos, concurrencia, consultas por
propiedad e historial propio. La integración real Bookings↔Reviews (T069) se ejecutó con el
handoff versionado, reserva `COMPLETED`, audience `stayhub-bookings-service` y scope
`reviews:eligibility`, sin compartir bases. Gateway↔Reviews (T070) permanece bloqueada porque
el API Gateway actual no implementa rutas ni cliente para Reviews.
