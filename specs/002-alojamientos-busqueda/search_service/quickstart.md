# Quickstart de validación: Search Service

Esta guía define la validación reproducible del Search Service implementado.

## Prerrequisitos

- Node.js 20 LTS y npm compatible con el lockfile.
- Docker Desktop/Engine con Compose.
- Puertos de desarrollo disponibles para Search, PostgreSQL/PostGIS, Redis y RabbitMQ.
- Secretos de desarrollo generados fuera de Git.

## Componentes esperados

```text
search-service:3004
search-db (PostgreSQL 16 + PostGIS)
search-redis (Redis 7)
rabbitmq (broker + management solo en desarrollo)
search-migrate (job Prisma)
```

`accommodations-service` no es prerrequisito. Los datos se cargan mediante fixtures contractuales o un publicador de prueba que usa `contracts/search-projection-events-v1.schema.json`.

## Preparación

1. Instalar dependencias desde la raíz con el lockfile.
2. Generar el cliente Prisma de Search.
3. Generar secretos/variables locales con `npm run env:search:dev`; `.env.search` queda ignorado por Git.
4. Levantar `search-db`, `search-redis` y RabbitMQ.
5. Ejecutar `prisma migrate deploy` mediante `search-migrate`.
6. Arrancar `search-service` y esperar `/health/ready`.

Scripts previstos:

```powershell
npm ci
npm run prisma:search:generate
npm run dev:search:up
```

## Escenario 1 - Salud y migraciones

- `GET /health/live` devuelve `200` mientras el proceso está vivo.
- `GET /health/ready` devuelve `200` solo con configuración válida, migraciones aplicadas y PostgreSQL disponible.
- Redis caído no cambia readiness si PostgreSQL funciona; la respuesta debe indicar degradación en logs/métricas.
- PostgreSQL caído produce `503` en readiness y búsquedas.

## Escenario 2 - Carga contractual

Publicar fixtures de:

- propiedad publicada en Bogotá, capacidad 4, wifi y piscina;
- propiedad publicada en Medellín, capacidad 2, wifi;
- propiedad no publicada;
- ventanas de disponibilidad conocidas.

Esperar ack después del commit y comprobar que:

- duplicar `eventId` no duplica datos;
- una versión antigua no reemplaza la nueva;
- `removed` retira el documento;
- un payload inválido llega al flujo de retry/DLQ según política.

En este incremento los eventos se publican exclusivamente mediante fixtures y el helper de pruebas. El productor y su outbox transaccional pertenecen al futuro `accommodations-service` y continúan explícitamente diferidos.

## Escenario 3 - Búsqueda combinada

Con service JWT válido:

```http
GET /internal/v1/search?location=Bogota&minPrice=100000&maxPrice=500000&currency=COP&guests=4&amenities=wifi&amenities=piscina&page=1&pageSize=20
Authorization: Bearer <service-jwt>
```

Resultado esperado:

- `200` con solo documentos publicados;
- todos cumplen ubicación, rango, capacidad y ambas amenidades;
- paginación estable;
- no se expone descripción completa ni información interna del evento.

## Escenario 4 - Texto y sugerencias

```http
GET /internal/v1/search?q=hotel+piscina
GET /internal/v1/search/suggest?q=bogta&limit=10
```

- Search ordena por relevancia determinista.
- Suggest puede devolver `Bogotá` por similitud trigram.
- Las sugerencias solo contienen nombre o ubicación y no datos personalizados.

## Escenario 5 - Fechas proyectadas

```http
GET /internal/v1/search?checkIn=2026-12-10&checkOut=2026-12-15&guests=2
```

- Solo coincide una ventana que cubre todo `[checkIn, checkOut)`.
- La respuesta marca `availabilityKind: PROJECTED`.
- La documentación aclara que no constituye confirmación de reserva.

## Escenario 6 - Validación y seguridad

- Falta de service JWT: `401`.
- Firma, `kid`, issuer o audience inválidos: `401`.
- Scope insuficiente: `403`.
- `minPrice > maxPrice`, fechas incompletas/invertidas, página inválida o campo desconocido: `400` Problem Details con `traceId`.
- Intentos de inyección se tratan como valores y no alteran SQL ni esquema.

## Escenario 7 - Resiliencia de caché

1. Ejecutar una consulta con Redis sano y observar miss → PostgreSQL → cache fill.
2. Repetir y observar hit equivalente.
3. Detener Redis y repetir.
4. La respuesta funcional debe seguir viniendo de PostgreSQL; no se cachean errores.
5. Aplicar un evento nuevo y comprobar que cambia la generación de caché.

## Escenario 8 - Rendimiento

Ejecutar el perfil versionado con:

- dataset representativo documentado;
- mezcla de texto, precio, capacidad, amenidades y fechas;
- caché fría y caliente;
- calentamiento y concurrencia explícitos;
- recursos/digest de imágenes y commit registrados.

Gate: p95 < 500 ms para `search` y `suggest`, sin errores inesperados. El reporte debe incluir plan/índices relevantes y no aceptar como evidencia un dataset trivial.

## Gates de calidad previstos

```powershell
npm run lint:search
npm run typecheck:search
npm run test:search:unit
npm run test:search:integration
npm run test:search:contract
npm run test:search:security
npm run test:search:performance
npm run build:search
```

La cobertura mínima del código afectado es 70 %, sin sustituir pruebas de integración, contrato, seguridad, eventos o rendimiento.


## Evidencia parcial — 2026-11-04: T019–T021 y T039

- Migración `001_search_projection` aplicada desde cero en PostgreSQL 16/PostGIS; Redis 7 aislado. Se usó Podman porque Docker no está instalado en el entorno de validación.
- `lint:search`, `typecheck:search` y `build:search`: correctos. Cliente Prisma generado y empaquetado como asset de Nest.
- Suite con `SEARCH_TEST_DATABASE_URL` y `SEARCH_TEST_REDIS_URL` apuntando a dependencias temporales: **59 pruebas / 18 suites aprobadas**, sin pruebas omitidas de las cuatro suites existentes. Rendimiento sigue pendiente de T065.
- Cobertura global: statements **89.89 %**, branches **83.62 %**, functions **84.34 %**, lines **90.65 %**.
- Readiness real: PostgreSQL migrado permite lectura con Redis/RabbitMQ fuera de línea; un schema que responde SQL pero carece de migraciones devuelve no listo. Pruebas HTTP comprueban `503` seguro, timeout y estado de cierre.
- Las pruebas comprueban redacción de JWT/URLs/términos, correlación de trazas y métricas en memoria, esquemas Swagger de búsqueda contra OpenAPI y drenado de una petición HTTP en curso antes de cerrar dependencias.
- Smoke test del proceso compilado (`node dist/apps/search-service/main.js`): `/health/ready` 200 con Redis sano/RabbitMQ degradado, `/docs-json` OpenAPI 3.1 y SIGTERM con código 0 aun con OTLP apagado.
- Runtime local de las pruebas: Node.js 26.13.0 / npm 12.2.1; validación del contenedor Node.js 20 pendiente de T068. No se validó un broker RabbitMQ sano real ni un colector OTLP externo.

Para repetir las suites, preparar dependencias aisladas y exportar `SEARCH_TEST_DATABASE_URL` y `SEARCH_TEST_REDIS_URL` (nunca usar una base con datos reales):

```bash
npm run prisma:search:generate
SEARCH_DATABASE_URL="$SEARCH_TEST_DATABASE_URL" npm run prisma:search:migrate:deploy
npm run build:search
npm run lint:search
npm run typecheck:search
npm run test:coverage --workspace @stayhub/search-service
```

Esta evidencia no cierra T063–T070 ni afirma integración con Gateway/Accommodations, consumo de eventos o disponibilidad autoritativa.

## Evidencia US3 — 2026-11-04: T051–T062

- Contrato JSON Schema Draft 2020-12 y validador runtime sincronizados para `upserted` y `removed`, incluyendo límites, formatos, cardinalidad y rechazo de propiedades adicionales.
- PostgreSQL/PostGIS real comprobó commit atómico de evento, documento, ventanas, cursor y generación; también replay idempotente, conflicto de hash, versiones stale, reemplazo de snapshot, rollback, concurrencia y tombstone.
- RabbitMQ 3.13 real comprobó mensaje persistente, consumo con ack manual posterior al caso de uso, prefetch, retry durable con backoff y poison message en DLQ sin registrar el payload.
- Suite completa con PostgreSQL, Redis y RabbitMQ temporales: **129 pruebas / 27 suites aprobadas**. Cobertura global: statements **91.96 %**, branches **83.37 %**, functions **87.80 %**, lines **94.16 %**.
- Esta evidencia usa un publicador contractual de pruebas. No afirma que exista integración productiva ni outbox en `accommodations-service`; ambos siguen fuera del alcance actual.

## Evidencia final — 2026-11-04: T063–T070

Todos los escenarios 1–8 fueron ejecutados mediante sus suites reproducibles contra dependencias temporales aisladas PostgreSQL/PostGIS, Redis y RabbitMQ. La correspondencia es: salud/migraciones en `runtime-health` y `prisma-readiness`; carga contractual/RabbitMQ en `projection-unit-of-work`, `rabbitmq-projection-consumer` y `rabbitmq-projection-runtime`; búsqueda, texto, sugerencias y fechas en `postgresql-search-index`/`postgresql-suggestions`; seguridad en las suites `security`; caché degradada en `redis-search-cache`; rendimiento en `search-performance-v1`.

- `lint:search`, `typecheck:search` y `build:search`: aprobados.
- Unidad: **53/53**; integración real: **28/28**; contrato: **58/58**; seguridad: **4/4**; rendimiento: **2/2**.
- Ejecución unificada con cobertura: **145/145 pruebas, 31/31 suites**, statements **92.46 %**, branches **84.01 %**, functions **88.73 %**, lines **94.43 %**.
- Perfil `search-performance-v1`: 5.000 documentos y ventanas, 12 solicitudes de calentamiento, 88 mediciones, concurrencia 8 y recursos declarados de 2 vCPU/1 GiB. Resultado de la corrida de cobertura: search p95 **40.33 ms**, suggest p95 **81.56 ms**, errores inesperados **0 %**; gate <500 ms y <1 % aprobado. Se comprobaron los índices GIN de FTS/trigram.
- Drift estricto aprobado para las cuatro operaciones OpenAPI, incluyendo descripciones, auth, parámetros y respuestas resueltas; JSON Schema, constantes, DTO runtime y fixtures de eventos también coinciden.
- Imagen `localhost/stayhub-search-validation:latest` construida desde cero con digest local `sha256:38aafcd26e590044240c3b70e59aecfd3442d0a6708ea5fa0cb7375e7dc3d4e7`: Node **v20.20.2**, UID **999**, OpenSSL 3, `tini`, ejecución correcta con root filesystem read-only, capabilities eliminadas y `no-new-privileges`.
- La estructura Compose comprobó migración completada antes del servicio, healthchecks de PostgreSQL/Redis/RabbitMQ/Search, secretos por interpolación no versionada y aislamiento de red. No fue necesario relajar la degradación funcional: una vez iniciado, Redis/RabbitMQ pueden reportarse como degradados mientras PostgreSQL siga listo.
- `npm ci` reportó 70 hallazgos transitivos (13 low, 38 moderate, 19 high). No se aplicó `audit fix --force` porque implicaría actualizaciones potencialmente incompatibles y fuera del alcance de estas tareas; requiere una remediación de dependencias separada.

Comandos usados para la evidencia final (URLs únicamente de contenedores efímeros):

```bash
npm run lint:search
npm run typecheck:search
npm run build:search
npm run test:search:unit
npm run test:search:contract
npm run test:search:security
SEARCH_TEST_DATABASE_URL="$SEARCH_TEST_DATABASE_URL" SEARCH_TEST_REDIS_URL="$SEARCH_TEST_REDIS_URL" SEARCH_TEST_RABBITMQ_URL="$SEARCH_TEST_RABBITMQ_URL" npm run test:search:integration
SEARCH_TEST_DATABASE_URL="$SEARCH_TEST_DATABASE_URL" SEARCH_TEST_REDIS_URL="$SEARCH_TEST_REDIS_URL" npm run test:search:performance
SEARCH_TEST_DATABASE_URL="$SEARCH_TEST_DATABASE_URL" SEARCH_TEST_REDIS_URL="$SEARCH_TEST_REDIS_URL" SEARCH_TEST_RABBITMQ_URL="$SEARCH_TEST_RABBITMQ_URL" npm run test:coverage --workspace @stayhub/search-service
podman build --target runtime -f infra/docker/search/Dockerfile -t localhost/stayhub-search-validation:latest .
```

Esta validación **no** afirma integración Gateway↔Search ni Accommodations↔Search. Tampoco afirma disponibilidad autoritativa: `PROJECTED` sigue siendo una proyección parcial de RQ-06 y debe revalidarse en el dominio responsable antes de reservar.
