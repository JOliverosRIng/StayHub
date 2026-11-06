# StayHub Search Service

Servicio interno NestJS que consulta una proyección local de alojamientos publicados. Implementa búsqueda combinada (RQ-04), sugerencias y consumo idempotente de eventos. Su respuesta aporta únicamente un resumen parcial a RQ-06: la disponibilidad marcada `PROJECTED` no confirma una reserva ni reemplaza al dominio autoritativo.

## Ejecución local

Requiere Node.js 20, PostgreSQL 16 con PostGIS, Redis 7 y RabbitMQ 3.13. Desde la raíz:

```bash
npm ci
npm run prisma:search:generate
SEARCH_DATABASE_URL="$SEARCH_DATABASE_URL" npm run prisma:search:migrate:deploy
npm run build:search
npm run start --workspace @stayhub/search-service
```

Para desarrollo aislado, el Compose exclusivo de Search genera credenciales y una llave efímera en archivos ignorados por Git. No carga ni exige variables de Auth, Users o Gateway:

```bash
npm run dev:search:up
curl http://127.0.0.1:3004/health/ready
```

Para detenerlo: `npm run dev:search:down`. Use `npm run env:search:dev -- --force` solo si también eliminará el volumen anterior, porque rota la contraseña de PostgreSQL.

## Configuración

Variables obligatorias: `SEARCH_DATABASE_URL` (o `SEARCH_DATABASE_URL_FILE` en el runtime), `SEARCH_REDIS_URL`, `SEARCH_RABBITMQ_URL`, `SEARCH_SERVICE_JWT_PUBLIC_KEYS_JSON`, `SEARCH_SERVICE_JWT_ISSUER`, `SEARCH_SERVICE_JWT_AUDIENCE`, `SEARCH_SERVICE_JWT_SCOPE` y `OTEL_EXPORTER_OTLP_ENDPOINT`.

Controles opcionales: `SEARCH_PORT`, `SEARCH_CACHE_TTL_SECONDS`, `SEARCH_CACHE_JITTER_SECONDS`, `SEARCH_PAGE_SIZE_MAX`, `SEARCH_SUGGEST_LIMIT_MAX`, `SEARCH_SIMILARITY_THRESHOLD`, `SEARCH_DEPENDENCY_TIMEOUT_MS`, `SEARCH_RABBITMQ_PREFETCH`, `SEARCH_RABBITMQ_MAX_RETRIES`, `SEARCH_RABBITMQ_RETRY_BASE_MS`, `SEARCH_SHUTDOWN_GRACE_MS`, `SEARCH_OTEL_SERVICE_NAME` y `SEARCH_LOG_LEVEL`.

No se deben versionar contraseñas, JWT, llaves ni URLs con credenciales. La aplicación rechaza configuración incompleta al arrancar.

## Migraciones y contratos

- Prisma: `prisma/schema.prisma` y `prisma/migrations/`.
- OpenAPI 3.1: `../../specs/002-alojamientos-busqueda/search_service/contracts/openapi-search-service.yaml` y `/docs-json` en el proceso.
- Eventos: `../../specs/002-alojamientos-busqueda/search_service/contracts/search-projection-events-v1.schema.json`.

Las pruebas de drift bloquean diferencias entre Swagger generado y OpenAPI, y entre fixtures/validador runtime y JSON Schema. La indexación productiva no expone un endpoint HTTP: consume `accommodation.search.v1.upserted|removed` mediante RabbitMQ.

## Seguridad y operación

Los endpoints `/internal/v1/search` y `/internal/v1/search/suggest` exigen service JWT RS256 con `kid`, issuer, audience, expiración y scope válidos. Las consultas están parametrizadas, se rechazan campos desconocidos y los errores siguen Problem Details sin filtrar payloads, términos, SQL ni credenciales.

`/health/live` comprueba el proceso. `/health/ready` exige PostgreSQL y migraciones; Redis o RabbitMQ caídos se reportan en `degraded` sin bloquear lecturas. Redis es fail-open y la búsqueda continúa contra PostgreSQL. RabbitMQ se reconecta en un nuevo arranque; los mensajes usan ack posterior al commit, retry limitado y DLQ.

Se exportan spans HTTP → caso de uso → PostgreSQL/Redis y consumer → transacción, además de duración HTTP/dependencias, cantidad de resultados, hit/miss/error de caché, timeouts SQL, lag de eventos y outcomes duplicate/stale/DLQ. Los atributos tienen cardinalidad acotada y no incluyen entrada del usuario.

## Calidad

```bash
npm run lint:search
npm run typecheck:search
npm run build:search
npm run test:search:unit
npm run test:search:integration
npm run test:search:contract
npm run test:search:security
npm run test:search:performance
npm run test:coverage --workspace @stayhub/search-service
```

Integración y rendimiento requieren `SEARCH_TEST_DATABASE_URL`, `SEARCH_TEST_REDIS_URL` y, para pruebas del consumidor, `SEARCH_TEST_RABBITMQ_URL`. El perfil `search-performance-v1` declara dataset, calentamiento, concurrencia, recursos y gates p95/error. Consulte el [quickstart](../../specs/002-alojamientos-busqueda/search_service/quickstart.md) para escenarios y evidencia.

## Límites explícitos

Este incremento no afirma integración Gateway → Search ni Accommodations → Search, tampoco implementa el outbox productor. Los eventos de validación provienen de fixtures/publicador de pruebas. Search no es fuente autoritativa de ficha, inventario ni disponibilidad.
