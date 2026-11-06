# Data Model: reviews-service

## 1. Review

Agregado inmutable y única entidad persistente del incremento.

| Campo | Tipo | Regla |
|---|---|---|
| `id` | UUID | PK generada por Reviews. |
| `bookingId` | UUID | Referencia externa; UNIQUE; no se expone en listados. |
| `propertyId` | UUID | Referencia externa derivada de Bookings; índice. |
| `guestId` | UUID | `sub` del GUEST; índice; no se expone públicamente. |
| `rating` | smallint | Entero 1..5; CHECK SQL y value object. |
| `comment` | varchar(2000) | Unicode, trim de extremos, no vacío. |
| `createdAt` | timestamptz | Servidor; inmutable. |

### Restricciones e índices

- PK `id`; UNIQUE `bookingId`; CHECK `rating BETWEEN 1 AND 5`; comentario no vacío y máximo 2.000.
- Sin FK hacia Bookings, Users o Accommodations.
- Sin `updatedAt`, `deletedAt` o moderación porque no existen esos flujos.
- Índices `(propertyId, createdAt DESC, id DESC)` y `(guestId, createdAt DESC, id DESC)`.

## 2. Rating

Value object no persistido de forma independiente: solo número entero, rango 1..5, sin convertir strings ni redondear decimales.

## 3. ReviewComment

String Unicode; trim solo en extremos; longitud posterior 1..2.000; no interpreta HTML/Markdown, no modera y no se registra completo.

## 4. ReviewEligibility

Valor efímero de Bookings; no es tabla local.

| Campo | Regla |
|---|---|
| `bookingId` | UUID que debe coincidir con el comando. |
| `guestId` | UUID que debe coincidir con el principal. |
| `propertyId` | Única fuente del ID persistido. |
| `eligible` | Solo `true` permite continuar. |

Respuesta mal formada o mismatch falla cerrado.

## 5. ReviewPage

Proyección no persistida con `items`, `page >=1`, `pageSize 1..100`, `total >=0` y `totalPages`. Cada item expone solo `id`, `propertyId`, `rating`, `comment`, `createdAt`.

## 6. Ciclo de vida

```text
Eligible booking + valid command → REVIEW CREATED → terminal e inmutable
```

No existen edición, eliminación, ocultamiento ni moderación.

## 7. Concurrencia

1. Bookings se consulta antes de la transacción local.
2. La inserción es una transacción corta.
3. Dos solicitudes pueden pasar elegibilidad, pero UNIQUE `bookingId` permite una sola fila.
4. La violación se traduce a `REVIEW_ALREADY_EXISTS`, sin SQL.
5. No existe transacción distribuida con Bookings.
