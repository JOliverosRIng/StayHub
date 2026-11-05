# Especificación: accommodations-service v1

**Rama**: `feature/accommodations-service`  
**Estado**: Borrador para aprobación  
**Fuente funcional**: decisiones aprobadas por el usuario en esta conversación; `tendencias.md`, RQ-03, RQ-05 y RQ-06; catálogo de servicios y rutas en `tendencias.md`.  
**Puerto**: `3003` (interno)

## Objetivo y límites

El servicio es dueño del ciclo de vida de propiedades de alojamiento: propiedades, habitaciones, características, tarifas base por noche, metadatos de fotografías y estado de publicación. Cada propiedad tiene al menos una habitación; un alojamiento de una sola unidad se representa con una habitación.

La API de esta versión se limita a `POST /properties`, `PUT /properties/{id}`, `GET /properties/{id}` y `POST /properties/{id}/photos`. No se incluyen búsqueda, reservas, disponibilidad, reseñas, pagos, CRUD de catálogo de características ni endpoints para consultar o borrar fotos.

El servicio mantiene una base de datos y almacenamiento de fotos propios. `ownerId` es una referencia UUID a la identidad de Users, no una clave foránea entre bases. Las verificaciones de identidad/rol usan JWT RS256 validado localmente; el propietario autenticado es el único que puede modificar la propiedad.

## Requisitos y trazabilidad

| Requisito | Fuente | Alcance de v1 |
|---|---|---|
| RQ-03 Editar propiedad | `tendencias.md` | El propietario edita los datos y habitaciones de una propiedad propia, incluso publicada. La representación PUT completa reemplaza la colección de habitaciones según las reglas de este documento. |
| RQ-05 Publicar propiedad | `tendencias.md` y decisión aprobada | Se crea como borrador y se publica mediante `PUT` con `status: PUBLISHED`, sujeto a los requisitos mínimos de publicación. |
| RQ-06 Ver detalles | `tendencias.md` | Propiedades publicadas se consultan públicamente; `DRAFT` y `UNPUBLISHED` solo por su propietario. |
| Fotos y características | Catálogo de servicios en `tendencias.md` y decisión aprobada | Fotos JPEG/PNG/WebP administradas por el servicio; catálogo relacional de características asignadas a propiedades. |

RQ-04 (búsqueda), reservas y otras capacidades de `tendencias.md` pertenecen a otros servicios y quedan fuera del alcance de este contrato.

## Actores

- **Propietario (`OWNER`)**: crea propiedades, modifica las propias, agrega fotos y las publica o despublica mediante PUT.
- **Visitante o usuario autenticado**: consulta propiedades `PUBLISHED`.
- **G1 / API Gateway**: consumidor externo esperado; la ruta pública y el forwarding de bearer deben coordinarse con el equipo Gateway.
- **G3 / Auth**: emite tokens/sesiones consumidos indirectamente por Gateway. La disponibilidad y semántica del rol `OWNER` en el JWT/introspección deben confirmarse con G3.

`OWNER` es el literal que usa `apps/users-service/src/domain/users/values.ts` (`UserRole`) y acepta `RolesGuard`; no se usan etiquetas `PROPRIETARIO`, `HOST` ni `ADMIN` en el contrato. El servicio de alojamientos debe validar el JWT RS256 y aplicar el mismo literal de rol. Un rol distinto de `OWNER` no puede modificar.

## Historias de usuario

### US1 — Crear un borrador de propiedad (P1)

Como propietario, quiero crear una propiedad con al menos una habitación para iniciar su preparación.

**Criterios de aceptación**

1. Una solicitud válida a `POST /properties` con autenticación `OWNER` crea la propiedad en `DRAFT`, sus habitaciones y características referenciadas, y responde `201` con el recurso.
2. El servicio asigna identificadores, `ownerId` a partir del `sub` validado y marcas de tiempo; el cliente no puede suplantar esos valores.
3. Falta de autenticación produce `401`; rol no permitido produce `403`; campos desconocidos, códigos `featureCodes` inexistentes o datos inválidos producen `400`. No se persiste una creación parcial.
4. La solicitud debe incluir al menos una habitación. No se admite crear directamente como `PUBLISHED`; se agrega al borrador la foto necesaria y después se solicita publicación mediante PUT.

### US2 — Editar íntegramente una propiedad propia (P1)

Como propietario, quiero reemplazar los datos y las habitaciones de mi propiedad para mantener la publicación correcta.

**Criterios de aceptación**

1. `PUT /properties/{id}` acepta la representación completa acordada y guarda la actualización atómicamente.
2. En `rooms`, un `id` existente actualiza esa habitación; la ausencia de `id` crea una. Las habitaciones actuales omitidas de la lista se eliminan.
3. La propiedad nunca queda sin habitaciones. Una petición que dejaría cero habitaciones se rechaza sin cambios.
4. Solo el propietario puede modificar; la identidad autenticada ajena se responde como `404`, sin revelar si el recurso existe. Falta de token `401`; rol insuficiente `403`.
5. `status` se cambia mediante este mismo PUT. Una transición a `PUBLISHED` que no satisface los requisitos se rechaza con `409 PUBLICATION_INCOMPLETE` y Problem Details, sin publicar ni guardar parcialmente otros cambios.
6. Un `Room.id` desconocido o perteneciente a otra propiedad produce `400 VALIDATION_ERROR` con `errors[].field: rooms[i].id`; la respuesta no revela si el ID existe.
7. PUT reemplaza la representación completa: omitir `description` la elimina y omitir `basePrice` en una habitación elimina su tarifa.
8. La transición inválida de estado produce `409 STATE_CONFLICT`. Se permiten `DRAFT → PUBLISHED`, `PUBLISHED → UNPUBLISHED` y `UNPUBLISHED → PUBLISHED`; `PUBLISHED → DRAFT` está prohibida (para despublicar se usa `UNPUBLISHED`). Cualquier otra transición no listada se rechaza.

### US3 — Consultar una propiedad (P1)

Como huésped/visitante, quiero consultar los detalles de una propiedad publicada; como propietario, quiero consultar mi borrador.

**Criterios de aceptación**

1. `GET /properties/{id}` sin autenticación devuelve el recurso si está `PUBLISHED`. Un token presente pero inválido, incluso para una propiedad pública, produce `401`; no se degrada a petición anónima.
2. El propietario autenticado puede consultar su propiedad `DRAFT`.
3. Un borrador consultado por otra persona no se distingue de un ID inexistente y devuelve `404`.
4. El recurso incluye habitaciones, precio base, códigos/nombres de características y metadatos/orden de fotos; no expone rutas de filesystem ni bytes de imagen.
5. `UNPUBLISHED` no es público; solo su propietario puede consultarlo.

### US4 — Agregar fotos (P1)

Como propietario, quiero asociar fotos a mi propiedad para completar su presentación.

**Criterios de aceptación**

1. `POST /properties/{id}/photos` recibe una fotografía multipart por solicitud, valida contenido por magic bytes y admite JPEG, PNG y WebP.
2. Cada archivo puede ocupar hasta 5.000.000 bytes inclusive; la propiedad puede tener hasta 10 fotografías. El límite se aplica antes de completar la escritura.
3. La identidad ajena produce `404`; no se modifica el recurso. Fallos de almacenamiento no dejan metadatos huérfanos ni archivos temporales publicados.
4. El servicio guarda bytes en almacenamiento local/volumen tras un `StoragePort`; PostgreSQL conserva metadatos, tipo verificado, tamaño, orden y referencia opaca del almacenamiento.
5. La API responde con metadatos de la foto y su posición. La forma en que los clientes obtendrán/servirán el binario requiere coordinación con Gateway o infraestructura de medios.

## Reglas de dominio

- Tipos de propiedad: `HOTEL`, `APARTMENT`, `HOUSE`, `OTHER`.
- Estados: `DRAFT`, `PUBLISHED`, `UNPUBLISHED`. Creación inicial en `DRAFT`.
- Una propiedad tiene siempre una o más habitaciones. Un alojamiento de una unidad usa exactamente una.
- Precio: tarifa base por noche por habitación, `amount` y moneda ISO 4217; no hay temporadas en v1.
- Características: catálogo `Feature(code, name)` y relación muchos-a-muchos con Property. El catálogo inicial se instala mediante semilla versionada; el cuerpo acepta códigos existentes y no crea nombres ni valores libres. No hay API de administración del catálogo en v1.
- `featureCodes` acepta hasta 50 códigos únicos.
- Requisitos para pasar a `PUBLISHED`: nombre no vacío, ubicación completa según el esquema acordado, al menos una habitación con precio base válido y al menos una foto persistida.
- `name` admite hasta 120 caracteres; `description`, hasta 5.000 caracteres.
- Ubicación: `addressLine`, `city`, `region`, `country` (ISO 3166-1 alpha-2); `postalCode` es opcional. `latitude` y `longitude` son opcionales, con rangos -90..90 y -180..180.
- Cada habitación tiene `capacity` entero mínimo 1. El importe se transporta como string decimal con patrón `^\d{1,10}(\.\d{1,2})?$` y valor mayor que cero; `currency` es ISO 4217.
- `PUT` requiere `version` para control optimista. Si no coincide con la versión persistida, responde `409` con `VERSION_CONFLICT` y no muta el agregado.
- La transición a `PUBLISHED` que incumpla requisitos devuelve `409 Conflict` con código estable de conflicto de estado y no aplica ningún otro cambio del PUT. Se elige `409` porque la validez depende del estado agregado actual y `users-service` ya clasifica `STATE_CONFLICT` como 409; no se adopta 422, que no forma parte del mapeo de errores documentado de Users.
- Cada `PUT` reemplaza la representación editable completa. Los campos de auditoría, `ownerId`, IDs de fotos existentes y datos internos de almacenamiento no son asignables por el cliente.
- Un ID de Room desconocido o ajeno se rechaza con `400 VALIDATION_ERROR`, `errors[].field = rooms[i].id`, sin revelar existencia.
- Las transiciones permitidas son `DRAFT → PUBLISHED`, `PUBLISHED → UNPUBLISHED` y `UNPUBLISHED → PUBLISHED`. `PUBLISHED → DRAFT` y cualquier otra transición no listada producen `409 STATE_CONFLICT`.
- PUT omite-remueve: si se omite `description`, se borra; si una Room omite `basePrice`, se borra esa tarifa.
- Fotos: JPEG/PNG/WebP detectados por contenido, tamaño 1–5.000.000 bytes, máximo 10 por propiedad. `position` define orden y debe ser único por propiedad.
- Agregar una foto con `POST /properties/{id}/photos` no incrementa `Property.version`.
- Respuestas de error siguen Problem Details del servicio Users (campos `type`, `title`, `status`, `detail`, `instance`, `code`, `traceId`, `errors`) y los códigos HTTP acordados en el borrador OpenAPI.

## Fuera de alcance

GET de bytes de foto, eliminación/reordenamiento dedicado de fotos, administración de catálogo, búsqueda, disponibilidad/calendario, reserva, política de cancelación, reseñas, pagos, moderación, endpoints adicionales y modificaciones a contratos de Gateway/Auth/Users.

## Ambigüedades abiertas y dependencias externas

Las decisiones de producto de v1 están fijadas en este documento y en el contrato OpenAPI. Las únicas dependencias abiertas son la integración con Gateway/Auth y la entrega de los bytes de fotos por G1.

**G1 (Gateway):** confirmar ruta pública exacta (por ejemplo, prefijo `/api/v1`), forwarding de bearer opcional en GET, autenticación/introspección previa, preservación de códigos de error, contrato consumer y mecanismo para servir bytes de fotos. El servicio solo publica las rutas de este documento en puerto interno `3003`.

**G3 (Auth):** confirmar que access JWT RS256 contiene `sub` UUID y `role: OWNER`, `iss`, `aud`, `kid`, `iat`, `exp` compatibles, cómo entrega la clave pública/JWKS; confirmar la introspección vigente que hace Gateway y cómo se revoca/expira una sesión. Accommodations valida firma y claims; no consulta directamente la base de Auth.

