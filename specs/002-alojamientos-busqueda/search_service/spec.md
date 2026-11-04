# Feature Specification: Search Service de StayHub

**Feature Branch**: `search_service`  
**Created**: 2026-11-02  
**Status**: Draft para planificación  
**Source of truth**: `tendencias.md`, RQ-04, contribución parcial a RQ-06 y criterios de aceptación del Sprint 2

## Alcance funcional

`search-service` permite consultar una proyección propia de alojamientos publicados mediante ubicación, rango de precios, fechas, capacidad, amenidades y palabras clave, combinando filtros y ordenando resultados por relevancia. También ofrece sugerencias mínimas derivadas de nombres y ubicaciones ya indexados.

El servicio se desarrolla de forma independiente. En este incremento no existe un `accommodations-service` productor; por ello el comportamiento se valida con fixtures y mensajes contractuales sobre una proyección de búsqueda controlada. La sincronización productiva con el catálogo real queda diferida.

### Requisitos fuente

| Fuente | Cobertura de este incremento | Estado honesto |
|---|---|---|
| **RQ-04 - Buscar propiedad** | Ubicación, precio, fechas, capacidad, amenidades, palabras clave, filtros combinados y relevancia sobre la proyección local. | Requisito principal. Implementable y verificable aisladamente; no se declara cumplimiento end-to-end con catálogo real hasta integrar un productor. |
| **RQ-06 - Ver detalles de una propiedad** | Cada resultado aporta `accommodationId` y un resumen navegable: nombre, ubicación, precio, capacidad, amenidades y miniatura opcional. | Contribución parcial. La ficha completa, galería, reseñas, mapa detallado y disponibilidad autoritativa quedan fuera de Search. |
| **RQ-03 - Editar propiedad** | Ninguna. Search solo reindexará una proyección futura. | Fuera de alcance. |
| **RQ-05 - Publicar propiedad** | Ninguna. Search no publica ni valida propiedades. | Fuera de alcance. |

## Historias de usuario y pruebas

### Historia 1 - Buscar alojamientos con filtros combinados (Prioridad P1)

Como huésped, quiero buscar alojamientos publicados por ubicación, precio, fechas, capacidad, amenidades y palabras clave para obtener alternativas relevantes.

**Prueba independiente**: cargar un dataset contractual en `search_db`, consultar combinaciones de filtros y comprobar que solo aparecen documentos publicados que satisfacen todos los criterios.

**Criterios de aceptación**:

1. Dadas proyecciones publicadas y no publicadas, cuando se busca sin filtros opcionales, solo se devuelven las publicadas.
2. Dados filtros de ubicación, precio, capacidad y amenidades, cuando se combinan, cada resultado cumple todos los filtros enviados.
3. Dadas fechas válidas, cuando se buscan alojamientos, el servicio filtra por disponibilidad proyectada que cubre el intervalo completo.
4. Dadas palabras clave, cuando se busca, los resultados se ordenan con una relevancia determinista basada en los campos indexados.
5. Dada una solicitud inválida, el servicio responde `400 application/problem+json` sin ejecutar una consulta insegura.

### Historia 2 - Obtener sugerencias (Prioridad P2)

Como huésped, quiero recibir sugerencias de nombres y ubicaciones mientras escribo para formular una búsqueda válida con rapidez.

**Prueba independiente**: cargar nombres y ubicaciones conocidas, consultar un prefijo o texto aproximado y comprobar sugerencias deduplicadas y ordenadas por similitud.

**Criterios de aceptación**:

1. Dado un término válido, se devuelven sugerencias derivadas únicamente de nombres y ubicaciones indexadas.
2. Dado un error ortográfico menor, `pg_trgm` permite sugerencias aproximadas cuando superan el umbral configurado.
3. Las sugerencias no son personalizadas y no usan historial, recomendaciones ni datos personales.

### Historia 3 - Mantener una proyección indexada idempotente (Prioridad P2)

Como operador del sistema, quiero que Search aplique mensajes versionados de alta, actualización y retiro para que su índice converja sin duplicados cuando exista un productor.

**Prueba independiente**: publicar fixtures contractuales duplicados, desordenados y de retiro; comprobar que la versión más reciente prevalece, los duplicados no alteran el estado y los retiros dejan de aparecer.

**Criterios de aceptación**:

1. Un evento `upserted` válido crea o actualiza atómicamente la proyección.
2. Un `eventId` repetido es idempotente.
3. Una versión menor o igual a la aplicada no sobrescribe una proyección más nueva.
4. Un evento `removed` vigente retira el documento de los resultados.
5. Un mensaje inválido o agotado se rechaza de forma segura y puede terminar en DLQ; nunca se confirma silenciosamente como aplicado.

## Requisitos funcionales

- **SR-FR-001**: El servicio MUST buscar únicamente proyecciones publicadas.
- **SR-FR-002**: MUST aceptar filtros combinables de ubicación textual, precio mínimo/máximo, intervalo de fechas, capacidad, amenidades y palabras clave.
- **SR-FR-003**: MUST aplicar semántica AND entre categorías de filtro y documentar la semántica de múltiples amenidades.
- **SR-FR-004**: MUST ordenar por relevancia determinista cuando exista texto; sin texto debe usar un orden estable y documentado.
- **SR-FR-005**: MUST paginar de forma acotada y devolver metadatos de paginación.
- **SR-FR-006**: MUST exponer `GET /internal/v1/search` y `GET /internal/v1/search/suggest`; el Gateway público queda fuera de este incremento.
- **SR-FR-007**: MUST generar sugerencias solo desde nombre y ubicación indexados, sin personalización.
- **SR-FR-008**: MUST almacenar una proyección propia en `search_db` y no consultar bases de otros servicios.
- **SR-FR-009**: MUST procesar contratos de proyección versionados de forma idempotente y tolerante a mensajes desordenados.
- **SR-FR-010**: MUST tratar la disponibilidad por fechas como snapshot declarado; no debe presentarla como validación autoritativa contra reservas.
- **SR-FR-011**: MUST devolver un resumen de resultado con `accommodationId`; no debe implementar la ficha completa de RQ-06.
- **SR-FR-012**: MUST documentar entradas, salidas, errores, autenticación interna y límites mediante OpenAPI.

## Requisitos no funcionales

- **SR-NFR-001 Rendimiento**: p95 menor de 500 ms para búsquedas y sugerencias en un escenario reproducible que declare dataset, concurrencia, calentamiento, recursos y caché fría/caliente.
- **SR-NFR-002 Escalabilidad**: proceso stateless, replicable, con estado únicamente en PostgreSQL, Redis y RabbitMQ.
- **SR-NFR-003 Seguridad**: rutas internas protegidas con service JWT; búsqueda pública futura no requiere user JWT. Toda entrada se valida, sanitiza y se consulta con SQL parametrizado.
- **SR-NFR-004 Disponibilidad**: PostgreSQL es autoritativo. Una caída de Redis degrada a consulta directa; no autoriza resultados incorrectos ni vuelve `not ready` al servicio si PostgreSQL funciona.
- **SR-NFR-005 Portabilidad**: servicio, migraciones, PostgreSQL/PostGIS, Redis y RabbitMQ se describen en Docker Compose y arrancan reproduciblemente.
- **SR-NFR-006 Mantenibilidad**: NestJS/TypeScript estricto, arquitectura hexagonal ligera, observabilidad correlacionada y cobertura mínima del 70 % del código afectado.
- **SR-NFR-007 Contratos**: OpenAPI y esquema de eventos permanecen sincronizados con el comportamiento mediante pruebas de contrato.

## Límites y exclusiones

- No se implementa `accommodations-service`, publicación, edición, carga de fotos ni detalle completo.
- No se modifica el frontend ni el API Gateway en este incremento.
- No se implementa Elasticsearch, OpenSearch, `pgvector`, búsqueda semántica, recomendaciones ni personalización.
- No se consulta `accommodations_db`, `bookings_db` ni otra base ajena.
- No se promete disponibilidad transaccional contra reservas activas.
- No se añade búsqueda geográfica por radio o polígonos como comportamiento público; PostGIS queda preparado para normalizar y ordenar ubicación y para una extensión funcional futura aprobada.

## Entidades conceptuales

- **SearchDocument**: proyección consultable de un alojamiento publicado.
- **AvailabilityWindow**: intervalo declarado que Search puede usar como filtro no autoritativo.
- **ProcessedProjectionEvent**: registro idempotente de eventos de proyección.
- **SearchQuery**: criterios validados, normalizados y paginados.
- **SearchSuggestion**: texto y tipo (`PROPERTY` o `LOCATION`) derivados del índice.

## Supuestos y dependencias diferidas

- Los fixtures usan una única moneda por consulta; la estrategia multi-moneda requiere decisión de producto antes de mezclar precios.
- Un productor futuro entregará eventos versionados de proyección; su implementación no forma parte de este incremento.
- El API Gateway expondrá posteriormente las rutas públicas y emitirá el service JWT aceptado por Search.
- `bookings-service` será la futura autoridad de disponibilidad transaccional.

## Éxito del incremento

- Todas las capacidades de RQ-04 funcionan contra una proyección contractual local.
- RQ-06 aparece solo como contribución parcial y no se declara completado.
- Búsqueda y sugerencias satisfacen p95 < 500 ms bajo el perfil documentado.
- Migraciones, índices, contratos, seguridad, resiliencia y contenedor cumplen la constitución.
- La evidencia no afirma integración productiva con servicios aún inexistentes.
