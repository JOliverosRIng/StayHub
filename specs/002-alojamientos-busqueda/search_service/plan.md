# Implementation Plan: Search Service de StayHub

**Branch**: `search_service` | **Date**: 2026-11-02 | **Spec**: `specs/002-alojamientos-busqueda/search_service/spec.md`

**Input**: especificación funcional derivada de `tendencias.md`, RQ-04, contribución parcial a RQ-06, criterios del Sprint 2 y constitución 1.0.0.

## Summary

Construir `search-service` como microservicio NestJS independiente para buscar una proyección propia de alojamientos publicados mediante ubicación textual, precio, fechas proyectadas, capacidad, amenidades y palabras clave, con relevancia determinista y sugerencias. La solución usa PostgreSQL 16 + PostGIS + Full Text Search + `pg_trgm`, Prisma 6.19 con SQL especializado encapsulado, Redis best-effort y contratos RabbitMQ versionados verificables con fixtures. No usa Elasticsearch, `pgvector`, la base de Accommodations ni una dependencia runtime del servicio todavía inexistente.

### Estado de implementación — 2026-11-04

Estado acumulado implementado y validado: **40 de 70 tareas**.

- Completadas: `T001–T040`.
- Incluye workspace NestJS, configuración, modelo Prisma/PostGIS, migración inicial, capas base, service JWT, Problem Details, Docker Compose, fixtures, dominio de búsqueda, adaptador PostgreSQL parametrizado, caché Redis fail-open, caso de uso, DTO, controller y módulo del MVP.
- Verificación actual: lint, TypeScript y build correctos; 59 pruebas aprobadas en 18 suites de unidad, integración, contrato y seguridad. PostgreSQL 16/PostGIS y Redis 7 reales aislados mediante Podman. Cobertura: statements 89.89 %, branches 83.62 %, functions 84.34 % y lines 90.65 %.
- La migración `001_search_projection` fue aplicada desde cero sobre PostgreSQL 16 + PostGIS real. La primera ejecución detectó que `array_to_string()` no era válida en una columna generada inmutable; se sustituyó por una columna `tsvector` mantenida mediante trigger, preservando los pesos A/B/C y los índices GIN.
- Segunda entrega (`T019–T021`, `T039`): logger JSON con redacción recursiva, SDK OTLP de trazas/métricas, trazas HTTP/PostgreSQL/Redis y helper para RabbitMQ; readiness verifica metadatos de migración y estado del índice, y reporta Redis/RabbitMQ degradados sin bloquear lecturas. Shutdown drena HTTP antes de liberar Prisma/Redis y tolera colector OTLP apagado.
- Swagger de búsqueda en OpenAPI 3.1 incluye parámetros, límites, service JWT, resumen, disponibilidad proyectada y Problem Details. Se compara con el contrato fuente en pruebas; el drift de sugerencias/eventos sigue pendiente de T063.
- El cliente Prisma se genera bajo `src/infrastructure/persistence/generated/client` y se copia como asset de Nest. Los scripts build/dev se ejecutan desde la raíz y start resuelve el dist desde el workspace. Se verificó el proceso compilado: readiness 200, Redis sano/RabbitMQ degradado, `/docs-json` 3.1 y SIGTERM con salida 0 incluso sin colector OTLP.
- Permanecen abiertas `T041–T070`: sugerencias, proyección por RabbitMQ, instrumentación específica del consumidor, métricas restantes, contratos completos, rendimiento y validación operativa final. El probe de RabbitMQ se prueba con mocks AMQP y conexión rechazada; el consumidor real corresponde a T060.
- Entorno de esta validación: Node.js 26.13.0 y npm 12.2.1. El objetivo Node.js 20 del Dockerfile se conserva; la comprobación del contenedor con ese runtime sigue dentro de T068.
- La implementación no modifica Gateway, frontend ni Accommodations y no declara todavía RQ-04 como validado end-to-end.

### Requisitos cumplidos por este desarrollo

| Requisito | Responsabilidad de Search | Declaración de cumplimiento |
|---|---|---|
| **RQ-04 Buscar propiedad** | Implementa filtros combinados, texto, relevancia, sugerencias y fechas sobre la proyección local. | Cobertura funcional principal y verificable de forma aislada. El cumplimiento end-to-end productivo queda pendiente de un productor real de proyecciones. |
| **RQ-06 Ver detalles** | Devuelve identificador y resumen suficiente para navegar al futuro detalle. | Contribución parcial; RQ-06 no se marca completo. |
| **RQ-03 Editar propiedad** | Ninguna. | Excluido. |
| **RQ-05 Publicar propiedad** | Ninguna. | Excluido. |
| **RNF Rendimiento** | Búsqueda/suggest p95 < 500 ms con perfil reproducible. | Gate técnico obligatorio. |
| **RNF Escalabilidad** | Proceso stateless y read model propio. | Aplicable. |
| **RNF Seguridad** | Service JWT, validación estricta y SQL parametrizado. | Aplicable a la API interna. |
| **RNF Mantenibilidad/Portabilidad/Comunicación** | Capas, OpenAPI, logs, Docker Compose, REST y eventos RabbitMQ. | Aplicable. |

## Technical Context

**Language/Version**: Node.js 20 LTS, TypeScript 5.7.3 estricto  
**Primary Dependencies**: NestJS 10.4.22, Prisma/@prisma/client 6.19.0, `class-validator`/`class-transformer`, Swagger 8.1.1, `ioredis` 5.4.2, JOSE 5.9.6, cliente RabbitMQ compatible con NestJS 10, OpenTelemetry  
**Storage**: `search_db` PostgreSQL 16 con PostGIS, `pg_trgm`, `tsvector`; Redis 7 no autoritativo; RabbitMQ 3 para ingestión asíncrona  
**Testing**: Jest 29.7, Supertest 7, PostgreSQL/PostGIS/Redis/RabbitMQ reales aislados, validación OpenAPI/JSON Schema y perfil de rendimiento versionado  
**Target Platform**: contenedores Linux, Docker Compose, puerto interno 3004  
**Project Type**: microservicio backend NestJS dentro del monorepo  
**Performance Goals**: p95 < 500 ms en `search` y `suggest`, medido con dataset y recursos declarados  
**Constraints**: sin Elasticsearch/pgvector; sin acceso a bases ajenas; sin `accommodations-service`; disponibilidad solo proyectada; Redis fail-open; cobertura mínima 70 %  
**Scale/Scope**: RQ-04 sobre un read model paginado; dos endpoints HTTP internos; dos tipos de evento; una base y caché propias

## Constitution Check

*GATE inicial y posterior al diseño: PASS.*

| Principio | Evaluación y evidencia del plan | Estado |
|---|---|---|
| I. Dominio por microservicio | Search solo posee búsqueda, sugerencias e indexación de su proyección. No publica ni edita alojamientos. | PASS |
| II. Capas y dependencias | Dominio/aplicación dependen de puertos; HTTP, PostgreSQL, Redis y RabbitMQ son adaptadores. | PASS |
| III. Datos independientes | `search_db` propio, sin tablas/FK/consultas a bases ajenas; duplicación y sincronización documentadas. | PASS |
| IV. Comunicación explícita | REST para consultas; RabbitMQ para hechos de proyección, con versión, ack, retry, DLQ e idempotencia. | PASS |
| V. Seguridad por defecto | Service JWT interno, validación/sanitización, SQL parametrizado, secretos y logs sin payload sensible. | PASS |
| VI. Código modular y tipado | TypeScript estricto y hexagonal ligera; no se introduce ORM adicional ni abstracción genérica injustificada. | PASS |
| VII. Contratos documentados | OpenAPI 3.1 y JSON Schema de eventos versionados con pruebas de drift. | PASS |
| VIII. Verificación/trazabilidad | RQ-04/RQ-06 y RNF mapeados a contratos, pruebas y DoD; no se promete integración inexistente. | PASS |

No existen violaciones constitucionales que requieran Complexity Tracking.

## Project Structure

### Documentation (this feature)

```text
specs/002-alojamientos-busqueda/search_service/
├── spec.md
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
├── contracts/
│   ├── openapi-search-service.yaml
│   └── search-projection-events-v1.schema.json
└── tasks.md                         # futuro: $speckit-tasks; no se crea aquí
```

### Source Code (repository root)

```text
apps/search-service/
├── prisma/
│   ├── schema.prisma
│   └── migrations/
├── src/
│   ├── domain/
│   │   ├── search-query.ts
│   │   ├── search-result.ts
│   │   ├── projection.ts
│   │   └── suggestion.ts
│   ├── application/
│   │   ├── ports/
│   │   │   ├── search-index.port.ts
│   │   │   ├── search-cache.port.ts
│   │   │   └── projection-events.port.ts
│   │   ├── search/search-accommodations.use-case.ts
│   │   ├── suggestions/suggest-search-terms.use-case.ts
│   │   └── projections/{upsert,remove}-projection.use-case.ts
│   ├── infrastructure/
│   │   ├── config/
│   │   ├── persistence/prisma/
│   │   ├── search/postgresql-search-index.adapter.ts
│   │   ├── cache/redis-search-cache.adapter.ts
│   │   ├── messaging/rabbitmq-projection.consumer.ts
│   │   ├── security/service-jwt.verifier.ts
│   │   └── observability/
│   ├── interfaces/
│   │   ├── http/{search,suggest,health}.controller.ts
│   │   ├── http/dto/
│   │   ├── http/guards/
│   │   ├── events/projection-event.dto.ts
│   │   └── openapi/
│   ├── modules/{search,suggestions,projections,service-auth,health}/
│   ├── app.module.ts
│   └── main.ts
├── test/{unit,integration,contract,security,performance}/
├── package.json
├── tsconfig.json
└── tsconfig.build.json

infra/docker/search/Dockerfile
docker-compose.yml                 # search-db, search-redis, rabbitmq, search-migrate, search-service
```

**Structure Decision**: mantener las capas y suites ya adoptadas por Auth/Users. Search usa puertos especializados orientados a consultas y proyecciones; no crea repositorios CRUD genéricos ni importa código de otros servicios.

## 1. Límites arquitectónicos

### Dominio

- Normaliza y valida `SearchQuery` sin NestJS, Prisma o HTTP.
- Define semántica AND entre categorías y entre amenidades solicitadas.
- Define orden determinista: score textual ponderado y `accommodationId` como desempate estable.
- Modela estados/versión de proyección e idempotencia, sin conocer RabbitMQ.
- Define que fechas representan `[checkIn, checkOut)` y disponibilidad `PROJECTED`.

### Aplicación

- `SearchAccommodations`: consulta caché, delega al índice, proyecta respuesta y llena caché best-effort.
- `SuggestSearchTerms`: consulta nombres/ubicaciones, deduplica y limita.
- `UpsertProjection`: valida evento, aplica solo versión superior, reemplaza ventanas y registra evento en una transacción.
- `RemoveProjection`: retira documento visible con versión monotónica y registra evento.
- Puertos: `SearchIndexPort`, `SearchCachePort`, reloj/UUID si son necesarios y unidad de trabajo de proyección.

### Adaptadores

- HTTP NestJS: DTOs, controller, service-auth guard, Problem Details, OpenAPI y `traceId`.
- PostgreSQL/Prisma: modelo, migraciones, consultas SQL parametrizadas, ranking e idempotencia.
- Redis: caché versionada, TTL y observabilidad; nunca fuente de verdad.
- RabbitMQ: traducción JSON Schema→comando, ack manual, retry/DLQ; no contiene decisiones de versión.
- Módulos NestJS: composición/inyección; ninguna política de negocio en factories.

## 2. Persistencia y búsqueda

### Base y extensiones

- Imagen PostgreSQL 16 con PostGIS compatible; `search_db` y usuario de mínimo privilegio.
- Migración inicial habilita `postgis` y `pg_trgm` y crea modelos de `data-model.md`.
- FTS usa `tsvector` ponderado: nombre/ciudad/región A; keywords/amenities B; descripción C.
- GIN para FTS/amenities/trigram; GiST para geografía; B-tree para publicación, moneda, precio y capacidad.
- El plan no expone radio/polígonos como filtro: almacenar coordenadas prepara el modelo sin crear comportamiento no aprobado.

### Prisma

- Mantener 6.19.0, cliente generado local y migraciones versionadas.
- Columnas PostGIS/`tsvector` se representan como `Unsupported` cuando aplique.
- Toda operación especial vive en `PostgreSqlSearchIndexAdapter`; `$queryRawUnsafe` queda prohibido con entrada de usuario.
- El adaptador devuelve tipos de aplicación, no filas Prisma.

### Moneda y fechas

- Precio siempre incluye ISO 4217; no se comparan monedas diferentes.
- Si la API recibe rango de precio, exige `currency`.
- Fechas se filtran contra ventanas proyectadas; respuesta marca `availabilityKind: PROJECTED`.

## 3. Contratos HTTP

Contrato: `contracts/openapi-search-service.yaml`.

| Ruta interna | Autenticación | Responsabilidad |
|---|---|---|
| `GET /internal/v1/search` | service JWT con audience/scope de Search | Buscar proyección publicada y paginada. |
| `GET /internal/v1/search/suggest` | service JWT | Sugerir nombre/ubicación sin personalización. |
| `GET /health/live` | ninguna, red interna | Proceso vivo. |
| `GET /health/ready` | ninguna, red interna | Configuración, migraciones y PostgreSQL listos. |

Reglas:

- `ValidationPipe` transforma, aplica whitelist y rechaza campos desconocidos.
- `checkIn`/`checkOut` aparecen juntos; rangos deben ser coherentes.
- `pageSize` máximo 100 y suggestions máximo 20.
- Errores usan `application/problem+json`, código seguro y `traceId`.
- `401` indica token ausente/inválido; `403`, scope insuficiente; `503`, dependencia autoritativa caída.
- El Gateway futuro mapeará `/search` y `/search/suggest`; modificar Gateway está fuera de alcance.

## 4. Contrato de proyección y RabbitMQ

Contrato: `contracts/search-projection-events-v1.schema.json`.

### Tipos

- `accommodation.search.v1.upserted`: snapshot completo y reemplazable del documento.
- `accommodation.search.v1.removed`: retiro/despublicación irreversible para esa versión.

### Semántica operacional

- Exchange/routing versionados y cola durable exclusiva de Search.
- Mensaje persistente, ack manual únicamente después del commit.
- `eventId` + hash detectan replay conflictivo; `projectionVersion` resuelve orden.
- Reintentos limitados con backoff; poison message va a DLQ con metadata segura, nunca payload en logs.
- Prefetch acotado para evitar presión sobre DB.
- Caída de RabbitMQ no invalida consultas existentes; se expone métrica/estado de sincronización degradada.
- El productor real y su outbox pertenecen al futuro `accommodations-service`; las pruebas actuales publican fixtures contractuales.

## 5. Caché Redis

- Namespace `search:v1:{cacheGeneration}:{hashFiltros}`.
- Hash calculado sobre filtros normalizados, página y tamaño; no incluye valores secretos ni PII.
- TTL corto configurable con jitter para reducir stampede.
- Solo respuestas `200` válidas; nunca errores o resultados parciales.
- Miss/fallo/JSON corrupto recurre a PostgreSQL y registra métrica segura.
- Mutación visible incrementa `cacheGeneration`; no se ejecutan barridos con `KEYS`.
- Redis no participa en exactitud, migraciones ni readiness autoritativo.

## 6. Seguridad

- Clave pública/issuer/audience/kid/scope separados para Gateway→Search.
- Solo RS256 permitido; expiración corta para service JWT y skew acotado.
- SQL siempre parametrizado; arrays y términos tienen límites de tamaño/cardinalidad.
- Respuestas no exponen payload de eventos, SQL, stack, hosts, claves ni datos privados.
- Logs redaccionan JWT/URLs sensibles y correlacionan `traceId`/`eventId`.
- Contenedor no root, filesystem de solo lectura cuando sea viable y secretos por archivos/Compose.
- Search no toma decisiones de rol de propietario ni autenticación de huésped.

## 7. Configuración, Docker y operación

### Variables

- Puerto, `SEARCH_DATABASE_URL_FILE`, Redis URL/secret, RabbitMQ URL/secret y nombres exchange/queue/DLQ.
- Service JWT public keys, issuer, audience y scope.
- TTL/cache namespace, page limits, similarity threshold, timeouts y prefetch.
- OTLP endpoint, nivel/formato de log y shutdown grace period.
- Toda configuración se valida al arranque; secretos ausentes fallan cerrado.

### Compose

- `search-db`: PostgreSQL 16 + PostGIS, volumen propio y healthcheck.
- `search-migrate`: `prisma migrate deploy`, termina antes del servicio.
- `search-redis`: instancia/credenciales separadas de Gateway/Auth.
- `rabbitmq`: broker compartible por infraestructura, vhost/usuario/permissions de mínimo privilegio.
- `search-service`: puerto interno 3004, redes internas, healthcheck y política de restart explícita.
- Search no publica puerto al host en Compose productivo; override de desarrollo puede limitarlo a `127.0.0.1`.

### Observabilidad

- Logs estructurados: ruta, estado, duración, cache hit/miss, generación, `traceId`; nunca término completo si puede contener PII.
- Métricas: latencia/histograma por endpoint, resultados, cache ratio, query timeout, lag de eventos, duplicates/stale/DLQ.
- Traces HTTP→caso de uso→PostgreSQL/Redis y consumer→transacción.
- `/health/ready` exige config, migraciones y DB; Redis/Rabbit se reportan como degradación operativa sin bloquear lectura existente.

## 8. Estrategia de pruebas

### Unidad

- Normalización y validación de filtros, fechas, precio/moneda, amenidades, paginación y límites.
- Ranking/desempate, mapeo de resultados y semántica `PROJECTED`.
- Claves de caché canónicas, generación, TTL y fallback.
- Idempotencia, versiones, upsert/remove y payload conflictivo.

### Integración

- PostgreSQL/PostGIS real: migraciones, constraints, FTS, trigram, amenidades, filtros combinados y ventanas.
- Consultas usan índices bajo dataset suficiente; `EXPLAIN` se registra como diagnóstico sin tests frágiles de plan exacto.
- Redis real: hit/miss, expiración, corrupción, caída y cambio de generación.
- RabbitMQ real: ack tras commit, redelivery, duplicate, out-of-order, retry y DLQ.

### Contrato y seguridad

- OpenAPI 3.1 válido y sin drift con Swagger generado.
- Eventos cumplen JSON Schema; fixtures del consumidor cubren ambas variantes.
- Service JWT: firma, algoritmo, `kid`, issuer, audience, exp y scope.
- Campos desconocidos, inyección, cardinalidad, respuestas seguras y redacción.

### Rendimiento

- Dataset reproducible suficientemente grande para ejercer índices.
- Mezcla de texto, precio, capacidad, amenidades y fechas; cache fría/caliente.
- Registrar commit, hardware/runner, memoria/CPU, versiones, seed, calentamiento y concurrencia.
- Gate p95 < 500 ms por endpoint y errores inesperados < 1 %.

### Integración diferida

- No se afirma prueba Gateway↔Search ni Accommodations↔Search.
- Se prueban stubs/fixtures contra los contratos para permitir integración posterior sin rediseño.

## 9. Dependencias y orden de implementación

```text
Contratos HTTP/eventos congelados
├── workspace/config/Docker
├── dominio + puertos + pruebas unitarias
└── schema/migraciones PostgreSQL

Migraciones + puertos
├── adaptador PostgreSQL/FTS/PostGIS
├── adaptador Redis
└── consumidor RabbitMQ con fixtures

Casos de uso + adaptadores
├── controladores/guards/OpenAPI
├── integración/contrato/seguridad
└── rendimiento/observabilidad/quickstart
```

Trabajo paralelizable:

- Contrato HTTP y DTOs pueden avanzar junto al esquema/eventos una vez congelada la semántica.
- Dominio/casos de uso pueden desarrollarse contra puertos falsos mientras se crean migraciones.
- Docker/observabilidad pueden avanzar después de fijar variables y health semantics.

Dependencias externas diferidas:

- Productor/outbox de Accommodations.
- Rutas públicas Gateway→Search.
- Autoridad de disponibilidad de Bookings.
- Vista de detalle de RQ-06.

## 10. Riesgos y mitigaciones

| Riesgo | Mitigación |
|---|---|
| Declarar RQ-04 completo sin catálogo real | Reportar cobertura aislada y diferir evidencia end-to-end. |
| Confundir resumen con RQ-06 completo | Contrato solo devuelve resumen/ID y plan lo marca parcial. |
| Fechas interpretadas como reserva confirmable | Campo `availabilityKind: PROJECTED` y documentación explícita. |
| Drift o pérdida de proyección | Versiones, idempotencia, DLQ, métricas y futuro rebuild/snapshot. |
| SQL PostGIS/FTS filtra a aplicación | Encapsularlo en adaptador con pruebas e interfaces tipadas. |
| Cache stampede/cardinalidad | TTL+jitter, límites, claves hash y fallback DB. |
| Evidencia de rendimiento trivial | Dataset y perfil versionados, cache fría/caliente y entorno registrado. |
| Moneda ambigua | Exigir una moneda para rangos; conversión fuera de alcance. |
| Root workspace actualmente incompleto | Integrar Search explícitamente en workspaces, scripts, `nest-cli.json`, `tsconfig` y CI durante implementación. |

## 11. Constitución post-diseño

Reevaluación: **PASS**. `data-model.md` documenta propietario y duplicación; OpenAPI/event schema documentan REST/mensajería; quickstart cubre seguridad, resiliencia y rendimiento; no se introducen requisitos de producto no aprobados. Las decisiones PostGIS/Prisma y eventos están aisladas en adaptadores. No quedan clarificaciones bloqueantes.

## 12. Criterios técnicos de terminado

- Workspace Search integrado sin romper Auth/Users/Gateway; lint, tipos y build pasan.
- `search_db` migra reproduciblemente con extensiones e índices; no usa `db push` ni bases ajenas.
- Búsqueda y sugerencias cumplen SR-FR-001–012 contra dataset contractual.
- RQ-04 tiene evidencia aislada; RQ-06 permanece marcada parcial; RQ-03/RQ-05 siguen fuera.
- OpenAPI/Swagger y JSON Schema no tienen drift.
- Eventos duplicados/desordenados/retiros convergen; retry/DLQ y ack están probados.
- Redis caído degrada a PostgreSQL sin resultados incorrectos.
- JWT, validación, SQL parametrizado, Problem Details, redacción y contenedor no root están verificados.
- Unit/integration/contract/security/performance pasan; cobertura afectada >= 70 % y p95 < 500 ms bajo perfil documentado.
- Compose levanta migración, Search, DB, Redis y RabbitMQ con healthchecks y secretos no versionados.
- Documentación declara que Accommodations/Gateway/Bookings productivos están diferidos y no presenta esta entrega como flujo end-to-end completo.

## Complexity Tracking

No aplica: no se identificaron violaciones constitucionales.
