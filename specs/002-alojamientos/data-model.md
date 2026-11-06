# Modelo de datos: accommodations-service v1

## Límites de ownership

`accommodations-service` es dueño de su base PostgreSQL y de su almacenamiento local de fotos. `ownerId` es un UUID externo procedente del `sub` JWT; no existe FK ni consulta directa a `users_db`/Auth. No se cambian modelos de Users, Auth, Gateway u otros grupos.

## Entidades propuestas

### Property

| Campo | Tipo propuesto | Reglas aprobadas/propuestas |
|---|---|---|
| `id` | UUID | PK, generado por servicio |
| `ownerId` | UUID | Requerido, `sub` de JWT `OWNER`, referencia externa sin FK |
| `type` | enum | `HOTEL`, `APARTMENT`, `HOUSE`, `OTHER` |
| `name` | varchar(120) | Requerido para publicar; máximo 120 caracteres |
| `description` | varchar(5000), nullable | Máximo 5.000 caracteres |
| `addressLine` | varchar | Dirección requerida para publicar |
| `city` | varchar | Ciudad requerida para publicar |
| `region` | varchar | Región/departamento requerido para publicar |
| `country` | char(2) | Código ISO 3166-1 alpha-2 requerido para publicar |
| `postalCode` | varchar, nullable | Opcional |
| `latitude` | Decimal, nullable | Opcional; -90..90 |
| `longitude` | Decimal, nullable | Opcional; -180..180 |
| `status` | enum | `DRAFT`, `PUBLISHED`, `UNPUBLISHED`; inicial `DRAFT` |
| `createdAt`, `updatedAt` | timestamptz | Gestionados por servidor |
| `version` | integer | Concurrencia optimista; requerido en PUT, incrementado en cada PUT exitoso; una carga Photo no lo incrementa |

Restricciones propuestas: índice de owner/status para consultas futuras; estado de publicación solo se cambia por la operación PUT; la transición a publicado comprueba nombre, ubicación, habitación con precio y foto dentro de una transacción coherente.

### Room

| Campo | Tipo propuesto | Reglas aprobadas/propuestas |
|---|---|---|
| `id` | UUID | PK |
| `propertyId` | UUID FK | Requerido; eliminación de habitación dentro de la transacción que reemplaza la colección |
| `name` | varchar | Nombre identificador de habitación |
| `capacity` | integer | Requerido; mínimo 1 |
| `basePriceAmount` | decimal/string | Importe positivo; transporte string con patrón `^\\d{1,10}(\\.\\d{1,2})?$` |
| `basePriceCurrency` | char(3) | Código de moneda ISO 4217 |
| `createdAt`, `updatedAt` | timestamptz | Gestionados por servidor |

Una propiedad mantiene al menos una Room. Una estancia de unidad única se representa con una Room. Cada Room lleva `capacity`; camas, baños y otros detalles no forman parte del contrato v1.

### Feature y PropertyFeature

| Entidad/campo | Tipo propuesto | Reglas |
|---|---|---|
| `Feature.code` | varchar, PK | Código estable único |
| `Feature.name` | varchar | Nombre de presentación requerido; el código estable es la identidad |
| `PropertyFeature.propertyId` | UUID FK | Relación a Property |
| `PropertyFeature.featureCode` | varchar FK | Relación a Feature; PK compuesta evita duplicados |

No existe `features` JSON ni texto libre. El endpoint acepta códigos existentes, no muta el catálogo. La migración/semilla versionada provee el catálogo inicial; no hay endpoint de gestión en el alcance actual.

Semilla inicial v1 (`code` → `name`):

| Code | Name |
|---|---|
| `WIFI` | Wi-Fi |
| `PARKING` | Parking |
| `POOL` | Pool |
| `AIR_CONDITIONING` | Air conditioning |
| `KITCHEN` | Kitchen |
| `PETS_ALLOWED` | Pets allowed |
| `BREAKFAST_INCLUDED` | Breakfast included |

### Photo

| Campo | Tipo propuesto | Reglas aprobadas/propuestas |
|---|---|---|
| `id` | UUID | PK |
| `propertyId` | UUID FK | Requerido |
| `storageKey` | varchar | Referencia opaca a `StoragePort`; nunca ruta del host en API |
| `mediaType` | enum/varchar | MIME detectado: `image/jpeg`, `image/png`, `image/webp` |
| `byteSize` | integer | 1–5.000.000 inclusive |
| `position` | integer | Orden único por propiedad |
| `createdAt` | timestamptz | Gestionado por servidor |

Índice único propuesto `(propertyId, position)`. Máximo 10 fotos por propiedad. Los bytes quedan en volumen local detrás de `StoragePort`; PostgreSQL conserva metadatos y referencia opaca, no los bytes. No hay endpoint de descarga ni eliminación dedicado en v1; el borrado de una foto como parte de reemplazo/eliminación del agregado debe borrar también el objeto almacenado.

## Invariantes agregadas

1. Property posee una o más Rooms; un PUT reemplaza la colección completa. `id` presente actualiza una Room perteneciente a esa propiedad, `id` ausente crea una y las Rooms existentes omitidas se eliminan. Omitir `description` elimina la descripción; omitir `basePrice` elimina el precio de esa Room.
2. Una Room enviada con ID ajeno/inexistente se rechaza como `400 VALIDATION_ERROR`, `errors[].field = rooms[i].id`, sin revelar existencia.
3. Precio pertenece a una Room, es una tarifa base por noche y contiene cantidad decimal y moneda ISO 4217; no hay periodos tarifarios.
4. `PUBLISHED` requiere nombre, ubicación, una Room con precio y al menos una Photo. La validación y actualización del agregado son atómicas.
5. `UNPUBLISHED` solo se expone al propietario autenticado; nunca en GET público.
6. `ownerId` se fija al crear desde JWT y jamás es asignable vía DTO.
7. Transiciones permitidas: `DRAFT → PUBLISHED`, `PUBLISHED → UNPUBLISHED`, `UNPUBLISHED → PUBLISHED`. `PUBLISHED → DRAFT` y toda transición no listada fallan con `409 STATE_CONFLICT`.
8. El PUT compara `version` e incrementa la versión en mutaciones de propiedad; agregar una Photo no incrementa `Property.version`.

## Dependencias externas

- G1 debe confirmar prefijo, forwarding opcional de bearer en GET, contrato consumer y mecanismo de entrega de bytes de Photo (sin añadir endpoint de descarga al contrato v1).
- G3 debe confirmar claims/llaves del access JWT RS256 compatibles con `OWNER`; no se consulta Auth directamente.

