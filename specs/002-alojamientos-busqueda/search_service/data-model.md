# Data Model: Search Service

## Principios

- `search_db` pertenece exclusivamente a `search-service`.
- El modelo es una proyección de lectura; no es fuente de verdad de alojamientos ni reservas.
- No existen claves foráneas a bases de otros servicios.
- Todo upsert se condiciona por `projectionVersion` y se ejecuta en una transacción con el registro de `eventId`.
- PostgreSQL 16 usa extensiones `postgis` y `pg_trgm`; FTS usa tipos nativos `tsvector`.

## SearchDocument

Representa el resumen indexado de un alojamiento.

| Campo | Tipo lógico | Reglas |
|---|---|---|
| `accommodationId` | UUID | PK externa estable, sin FK. |
| `projectionVersion` | bigint | Positivo; solo una versión mayor puede reemplazar la actual. |
| `published` | boolean | Solo `true` es consultable. |
| `name` | varchar(160) | Trim, no vacío. Peso FTS A. |
| `description` | text | Resumen indexable, no ficha autoritativa. Peso FTS C. |
| `countryCode` | char(2) | ISO 3166-1 alpha-2 normalizado. |
| `region` | varchar(120) | Nullable; peso FTS A. |
| `city` | varchar(120) | Requerido; peso FTS A y sugerencias. |
| `addressSummary` | varchar(240) | Nullable; no debe exponer datos privados. |
| `location` | geography(Point,4326) | Nullable durante fixtures; índice GiST. No habilita por sí sola filtros públicos por radio. |
| `minNightlyPrice` | numeric(12,2) | Mayor o igual a cero. |
| `currency` | char(3) | ISO 4217; filtros de precio comparan una sola moneda. |
| `capacity` | integer | Mayor que cero. |
| `amenities` | text[] | Valores normalizados, sin duplicados; todas las solicitadas deben estar presentes. |
| `keywords` | text[] | Términos contractuales adicionales; peso FTS B. |
| `primaryPhotoUrl` | text | Nullable; solo miniatura/resumen, no galería. |
| `searchVector` | tsvector | Derivado con pesos: nombre/ubicación A, keywords/amenities B, descripción C. |
| `sourceUpdatedAt` | timestamptz | Timestamp informado por el productor. |
| `indexedAt` | timestamptz | Timestamp de aplicación local. |

### Índices

- PK B-tree en `accommodationId`.
- Parcial B-tree en `(published, minNightlyPrice, capacity)` para documentos publicados.
- GIN en `searchVector`.
- GIN `gin_trgm_ops` en `name` y `city` para sugerencias.
- GIN en `amenities`.
- GiST en `location`.
- Índice en `(currency, minNightlyPrice)`.

## AvailabilityWindow

Snapshot declarado de fechas; no representa una reserva ni garantiza disponibilidad al confirmar.

| Campo | Tipo lógico | Reglas |
|---|---|---|
| `id` | UUID | PK local. |
| `accommodationId` | UUID | FK local a `SearchDocument`, cascade delete. |
| `startDate` | date | Inclusiva. |
| `endDate` | date | Exclusiva; mayor que `startDate`. |
| `availableCapacity` | integer | Mayor que cero. |
| `projectionVersion` | bigint | Coincide con la versión que produjo la ventana. |

Una búsqueda `[checkIn, checkOut)` coincide cuando existe una ventana con `startDate <= checkIn`, `endDate >= checkOut` y capacidad suficiente.

### Índices

- B-tree en `(accommodationId, startDate, endDate)`.
- B-tree en `(startDate, endDate, availableCapacity)` para filtrado.

## ProcessedProjectionEvent

Garantiza idempotencia y auditoría técnica sin guardar payload completo.

| Campo | Tipo lógico | Reglas |
|---|---|---|
| `eventId` | UUID | PK. |
| `eventType` | varchar(100) | Tipo contractual conocido. |
| `accommodationId` | UUID | Entidad afectada. |
| `projectionVersion` | bigint | Versión recibida. |
| `payloadHash` | char(64) | SHA-256 para detectar reutilización conflictiva de `eventId`. |
| `outcome` | enum | `APPLIED`, `IGNORED_STALE`, `REMOVED`. |
| `processedAt` | timestamptz | Hora local de commit. |

Retención operativa configurable; purgar registros antiguos no debe permitir que una versión vieja sobrescriba el `projectionVersion` conservado en `SearchDocument`.

## SearchIndexState

Fila técnica para invalidación eficiente de caché.

| Campo | Tipo | Reglas |
|---|---|---|
| `id` | smallint | Siempre `1`. |
| `cacheGeneration` | bigint | Incrementa después de una mutación visible. |
| `updatedAt` | timestamptz | Último cambio. |

## Objetos no persistidos

### SearchQuery

- `q`: texto opcional normalizado, longitud acotada.
- `location`: ciudad/región/país textual opcional.
- `minPrice`, `maxPrice`, `currency`: rango coherente; `currency` requerida cuando se filtra precio.
- `checkIn`, `checkOut`: ambos o ninguno; `checkOut > checkIn`.
- `guests`: entero positivo opcional.
- `amenities`: conjunto normalizado y acotado; semántica AND.
- `page`: entero >= 1, default 1.
- `pageSize`: entero 1-100, default 20.

### SearchResult

- `accommodationId`, `name`, `locationSummary`, `minNightlyPrice`, `currency`, `capacity`, `amenities`, `primaryPhotoUrl`, `relevance`.
- Metadatos: `page`, `pageSize`, `total`, `hasNext` y `availabilityKind: PROJECTED` cuando se filtraron fechas.

### SearchSuggestion

- `text`.
- `type`: `PROPERTY` o `LOCATION`.
- `score` interno; el contrato puede omitirlo.

## Transiciones de proyección

```text
ABSENT --upsert(v1)--> PUBLISHED/UNPUBLISHED(v1)
vN --upsert(v>N)--> vNew
vN --upsert(v<=N)--> IGNORE STALE
vN --removed(v>N)--> ABSENT + tombstone/version record
eventId repetido --> IDEMPOTENT SUCCESS o conflicto si payloadHash cambia
```

## Prisma y migraciones

- Prisma schema conserva modelos ordinarios y marca tipos no soportados cuando corresponda.
- Migraciones SQL ejecutan `CREATE EXTENSION IF NOT EXISTS postgis` y `pg_trgm`, constraints, columnas FTS e índices.
- Consultas FTS/PostGIS permanecen en el adaptador PostgreSQL y siempre son parametrizadas.
- `prisma migrate deploy` se ejecuta mediante un job `search-migrate`; no se usa `db push` en runtime.
