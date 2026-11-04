# Research: Search Service de StayHub

**Fecha**: 2026-11-02  
**Alcance**: decisiones técnicas previas al diseño del `search-service`

## 1. Motor de búsqueda y persistencia

**Decisión**: usar PostgreSQL 16 como base propia `search_db`, con PostGIS, Full Text Search (`tsvector`/`tsquery`), `pg_trgm` e índices B-tree, GIN y GiST. No usar Elasticsearch, OpenSearch ni `pgvector`.

**Rationale**: RQ-04 requiere filtros relacionales, texto, ubicación y relevancia, no búsqueda semántica. PostgreSQL cubre el alcance con una única autoridad operativa; GIN es el índice preferido por PostgreSQL para FTS, `pg_trgm` cubre similitud y errores menores, y PostGIS aporta tipos/índices geográficos. Evita un segundo motor, sincronización adicional y operación innecesaria.

**Alternativas consideradas**:

- Elasticsearch: potente para relevancia lingüística y facetas a gran escala, pero añade cluster, mappings, reindexación y consistencia eventual sin necesidad demostrada.
- `pgvector`: sirve para embeddings y similitud vectorial; RQ-04 no exige semántica ni IA.
- Consultar la base de Accommodations: viola propiedad independiente de datos y acopla despliegue/esquema.

**Fuentes**:

- PostgreSQL 16, Full Text Search e índices: https://www.postgresql.org/docs/16/textsearch.html
- PostgreSQL 16, `pg_trgm`: https://www.postgresql.org/docs/16/pgtrgm.html
- PostGIS, consultas e índices espaciales: https://postgis.net/docs/manual-dev/en/using_postgis_query.html

## 2. ORM y SQL especializado

**Decisión**: conservar Prisma ORM 6.19.0 por consistencia con Auth/Users. Crear extensiones, tipos, columnas generadas e índices en migraciones SQL versionadas; encapsular consultas PostGIS/FTS parametrizadas en `PostgreSqlSearchIndexAdapter` mediante `$queryRaw`/TypedSQL compatible con la versión adoptada.

**Rationale**: el repositorio ya estandarizó Prisma 6.19. PostGIS y `tsvector` requieren SQL que Prisma 6 no modela completamente. El adaptador evita filtrar SQL o tipos `Unsupported` al dominio/aplicación.

**Alternativas consideradas**:

- Introducir TypeORM: rechazado por duplicar ORM y convenciones.
- Actualizar solo Search a Prisma 8: rechazado por crear drift de toolchain en el mismo monorepo.
- Ocultar toda consulta detrás de repositorios genéricos: rechazado; Search necesita consultas explícitas y optimizadas.

**Fuente**: https://www.prisma.io/docs/postgres/database/postgres-extensions

## 3. Arquitectura interna

**Decisión**: arquitectura hexagonal ligera organizada en capas Clean: `domain`, `application`, `infrastructure`, `interfaces` y `modules`.

**Rationale**: coincide con Auth/Users y con la constitución. Los casos de uso dependen de `SearchIndexPort` y `SearchCachePort`; PostgreSQL, Redis, RabbitMQ y HTTP son adaptadores. Se evita DDD artificial y repositorios CRUD por tabla.

**Alternativas consideradas**:

- Controller → Prisma directo: sencillo al inicio, pero mezcla validación, ranking, caché y SQL y dificulta cambiar adaptadores.
- Copiar toda la complejidad de Auth: rechazado; Search es mayormente query/read-model y requiere menos entidades ricas.

## 4. Propiedad y sincronización de datos

**Decisión**: Search posee `search_db` y mantiene un read model. Un productor futuro enviará eventos `accommodation.search.v1.upserted` y `accommodation.search.v1.removed`. Este incremento implementa contrato y consumidor verificable con fixtures, sin requerir que `accommodations-service` exista o esté disponible en runtime para consultar.

**Rationale**: Search necesita autonomía de consulta. Los eventos expresan hechos que no requieren respuesta inmediata y cumplen la constitución. `eventId` y `projectionVersion` permiten duplicados, reintentos y mensajes fuera de orden.

**Alternativas consideradas**:

- REST síncrono por cada búsqueda: rechazado por dependencia temporal y latencia.
- Endpoint público de indexación provisional: rechazado por no existir en `tendencias.md` y ampliar superficie de ataque.
- No definir ingestión: rechazado porque dejaría una base sin mecanismo contractual de actualización.

## 5. RabbitMQ y tolerancia a fallos

**Decisión**: consumidor con cola durable, mensajes persistentes, ack manual después de commit, prefetch acotado, reintentos limitados y DLX/DLQ. Mensajes duplicados son éxito idempotente; versiones antiguas se ignoran de forma observable.

**Rationale**: RabbitMQ puede redeliver; los acknowledgements manuales y DLQ evitan pérdida silenciosa. Search continúa atendiendo su índice existente si el broker cae, aunque reporta sincronización degradada.

**Alternativas consideradas**:

- Auto-ack: rechazado por riesgo de pérdida antes de persistir.
- Requeue infinito: rechazado por bucles de poison messages.
- Hacer RabbitMQ requisito de cada consulta: rechazado; el read model local debe ser autónomo.

**Fuente**: https://www.rabbitmq.com/docs/confirms

## 6. Redis

**Decisión**: caché best-effort y fail-open hacia PostgreSQL. Claves canónicas incluyen versión de esquema y hash de filtros normalizados; TTL corto y límites de cardinalidad. No se cachean errores. La actualización de proyección incrementa una versión lógica de índice para invalidación.

**Rationale**: Redis mejora consultas repetidas, pero no es autoridad. La caída de Redis no debe impedir búsquedas si PostgreSQL está disponible.

**Alternativas consideradas**:

- Redis obligatorio para readiness: rechazado por reducir disponibilidad sin proteger consistencia.
- Invalidar cada clave por patrón: rechazado por coste y carreras; versionar namespace simplifica invalidación.

## 7. Seguridad y contratos HTTP

**Decisión**: `GET /internal/v1/search` y `GET /internal/v1/search/suggest` requieren service JWT Gateway→Search. El futuro endpoint público será anónimo y pertenecerá al Gateway. DTOs aplican whitelist/forbid, límites de tamaño y Problem Details con `traceId`.

**Rationale**: los microservicios no deben exponerse directamente. Search no necesita identidad de usuario ni roles para una consulta pública, pero sí autenticar al llamador interno.

**Alternativas consideradas**:

- Exigir access JWT de usuario: rechazado; el producto permite descubrimiento público y no existe necesidad funcional.
- Confiar en cabeceras de identidad del cliente: rechazado por spoofing.

## 8. Semántica mínima de relevancia y sugerencias

**Decisión**: relevancia determinista por pesos: nombre/ubicación > amenidades/keywords > descripción; desempate estable por `accommodationId`. Sugerencias limitadas a nombres y ubicaciones indexadas, ordenadas por similitud y deduplicadas.

**Rationale**: satisface RQ-04 y `/search/suggest` sin introducir personalización ni recomendaciones.

**Alternativas consideradas**:

- Ranking aprendido o historial de usuario: fuera de alcance; corresponde a recomendaciones.
- Aleatoriedad: rechazada porque rompe paginación y reproducibilidad.

## 9. Disponibilidad por fechas

**Decisión**: filtrar solo snapshots de ventanas declaradas que cubran `[checkIn, checkOut)`. La respuesta y documentación deben declarar que no equivale a confirmación de reserva.

**Rationale**: Sprint 2 exige fechas, pero la autoridad de reservas aparece en Sprint 3. Esta separación evita que Search se convierta en sistema transaccional.

**Alternativas consideradas**:

- Omitir fechas: incumple RQ-04.
- Prometer disponibilidad definitiva: incorrecto sin `bookings-service`.

## 10. Verificación

**Decisión**: Jest/Supertest para unidad, HTTP y contratos; PostgreSQL/PostGIS, Redis y RabbitMQ reales aislados para integración; dataset versionado y prueba de rendimiento con caché fría/caliente para p95 < 500 ms.

**Rationale**: coincide con el repositorio y la constitución. La medición debe declarar dataset, filtros, concurrencia, calentamiento y recursos para evitar una evidencia engañosa.

**Alternativas consideradas**:

- SQLite/in-memory: no ejercita extensiones, índices ni SQL real.
- Solo mocks: no valida migraciones, planes de consulta, Redis ni acknowledgements.

## Clarificaciones resueltas

- PostgreSQL no se usará como base vectorial; no habrá embeddings.
- RQ-04 es el requisito principal, demostrable aisladamente pero no end-to-end productivo.
- RQ-06 es contribución parcial; no se declara completo.
- RQ-03 y RQ-05 están fuera de alcance.
- Accommodations no es dependencia runtime de las consultas de este incremento.
- No quedan decisiones abiertas que bloqueen el diseño; moneda múltiple queda explícitamente diferida y cada consulta opera sobre una moneda declarada por la proyección.
