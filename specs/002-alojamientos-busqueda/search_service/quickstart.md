# Quickstart de validación: Search Service

Esta guía define la validación esperada después de implementar el plan. No implica que el código exista todavía.

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
3. Crear secretos/variables desde `.env.example` sin versionar valores reales.
4. Levantar `search-db`, `search-redis` y RabbitMQ.
5. Ejecutar `prisma migrate deploy` mediante `search-migrate`.
6. Arrancar `search-service` y esperar `/health/ready`.

Scripts previstos:

```powershell
npm ci
npm run prisma:search:generate
docker compose up -d search-db search-redis rabbitmq search-migrate search-service
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
