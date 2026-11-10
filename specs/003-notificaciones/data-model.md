# Modelo de datos — notifications-service

## Notification

Un registro representa una notificación preparada para un usuario por un llamador autenticado. El servicio conserva el mensaje para canal in-app y mantiene el mismo registro de estado para canal email local.

| Campo | Tipo lógico | Regla |
|---|---|---|
| `id` | UUID | Identificador generado por el servicio; PK. |
| `userId` | UUID | Obligatorio; referencia externa a Users sin FK/consulta. |
| `type` | enum | `BOOKING_CONFIRMATION`, `CHECKIN_REMINDER`, `SYSTEM_ALERT`. |
| `channel` | enum | `EMAIL`, `IN_APP`. |
| `recipientEmail` | string nullable | Requerido y validado solo para `EMAIL`; dato interno, nunca en respuestas de lectura/logs. |
| `subject` | string | 1–120 caracteres después de renderizar. |
| `body` | string | 1–5000 caracteres después de renderizar; contenido sensible, nunca en logs. |
| `status` | enum | `PENDING`, `SENT`, `FAILED`; crea PENDING, IN_APP→SENT con persistencia, EMAIL→SENT tras aceptación local, fallo→FAILED. |
| `failureReason` | string nullable | Código finito no sensible (p. ej. `DELIVERY_UNAVAILABLE`); no almacenar excepciones/cuerpo. No se devuelve a GET. |
| `idempotencyKey` | string | Obligatoria, 1–128 caracteres, única global; nunca se devuelve ni registra. |
| `requestFingerprint` | string | SHA-256 lowercase hex del JSON canónico de `userId`, tipo, canal, destinatario normalizado, variables normalizadas; interno, no devuelto/logueado. Permite distinguir replay/conflicto. |
| `createdAt` | instante UTC | Generado por servidor. |
| `sentAt` | instante UTC nullable | Se establece al aceptar persistencia/adapter; nulo en PENDING/FAILED. |

**Índices**: unique `idempotencyKey`; `(userId, createdAt DESC, id DESC)` para listar; índice opcional `(userId, status, type, createdAt DESC, id DESC)` si la consulta/plan lo justifica. Paginación por cursor compuesto `(createdAt,id)` y comparación lexicográfica descendente.

## Payload de creación y `templateData`

Campos comunes: `userId` UUID, `type`, `channel`, `templateData` objeto cerrado y `recipientEmail` solo cuando `channel=EMAIL`. `Idempotency-Key` es header obligatorio, conforme al patrón de comandos HTTP con idempotencia ya usado en el repo. El request fingerprint incluye ese contenido semántico y excluye header/representación JSON no semántica.

| `type` | Campos requeridos en `templateData` | Formato |
|---|---|---|
| `BOOKING_CONFIRMATION` | `bookingId`, `roomTitle`, `roomLocation`, `checkIn`, `checkOut`, `guests`, `totalPrice` | `bookingId` string opaco de 1–100 chars; título 1–120; ubicación 1–200; fechas ISO `YYYY-MM-DD`, `checkOut > checkIn`; guests entero 1–100; total decimal string `0` o mayor, hasta 2 decimales y máximo 10 dígitos enteros. |
| `CHECKIN_REMINDER` | `bookingId`, `roomTitle`, `roomLocation`, `checkIn` | Mismos límites de bookingId, título, ubicación y fecha ISO. |
| `SYSTEM_ALERT` | `alertCode`, `title`, `message` | code `[A-Z][A-Z0-9_]{1,63}`; title 1–120; message 1–2000. Texto plano proporcionado por llamador autorizado. |

No se admiten propiedades extra. El renderizador debe escapar caracteres de interpolación y producir texto plano. El cliente no puede enviar `subject`, `body`, `status`, `failureReason`, `sentAt`, `id`, `recipientEmail` dentro de `templateData` ni sobrescribir valores generados.

## Estados y errores de entrega

```text
PENDING ── persistencia in-app ──> SENT
PENDING ── email fake acepta ───> SENT
PENDING ── email fake falla ────> FAILED
```

No hay reintento automático ni transición posterior en v1. Si se reenvía el mismo `Idempotency-Key`, el recurso existente se devuelve también para estado FAILED; el caller requiere clave nueva para otra solicitud, sujeto a la decisión de no añadir un mecanismo de retry.

## Representación de lectura

Respuesta/proyección: `id`, `userId`, `type`, `channel`, `subject`, `body`, `status`, `createdAt`, `sentAt`. Nunca contiene `recipientEmail`, `failureReason`, `idempotencyKey` ni `requestFingerprint`. La autorización debe ocurrir antes de ejecutar la consulta.

## Cursor

Token opaco base64url de JSON versionado con `createdAt` ISO UTC e `id` UUID. Se valida estrictamente y filtra registros menores que el par de cursor para orden descendente. Manipularlo solo cambia la página dentro de los registros que el usuario ya está autorizado a consultar; no incluye datos de usuario ni se trata como autorización.

