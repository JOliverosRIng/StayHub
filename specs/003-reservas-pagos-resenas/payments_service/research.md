# Research: Payments Service de StayHub

Cada decisión técnica con su razón y las alternativas descartadas. Las marcadas **[Aprobar]** dependen de las decisiones D-01…D-13 de `spec.md`.

## R-01 Pasarela simulada tras un puerto

- **Decisión**: `PaymentGatewayPort` (`charge`, `refund`, `getTransaction`) con `MockPaymentGatewayAdapter` determinista.
- **Razón**: el Sprint 3 pide "integración mock de pasarela". El puerto permite cambiar a una pasarela real sin tocar dominio ni casos de uso (constitución II).
- **Comportamiento por token (solo fixtures)**: `tok_approved` aprueba; `tok_declined_funds` rechaza `INSUFFICIENT_FUNDS`; `tok_declined_fraud` rechaza `SUSPECTED_FRAUD`; `tok_gateway_timeout` **persiste un cargo aprobado y luego pierde la respuesta**; `tok_gateway_down` representa caída **antes del envío**; `tok_refund_fails` aprueba el cargo pero la operación de reembolso se rechaza definitivamente, según marca no sensible del ledger mock. Cualquier otro token válido aprueba. Nunca se guarda el token claro.
- **Descartado**: llamar a una sandbox real (credenciales, red, flakiness en pruebas y demo).
- **Recuperación [Aprobar D-13]**: ledger `mock_gateway_operations` de dev/test, con HMAC de referencia opaca y resultado no sensible. Se confirma **fuera de la transacción de Payments** antes de simular pérdida de respuesta; `getTransaction` consulta el resultado desde una nueva instancia. El ledger prueba el comportamiento de una pasarela externa sin ser la fuente de verdad del pago de negocio.

## R-02 Resultado ambiguo = PENDING, no rechazo

- **Decisión**: un timeout tras enviar el cobro deja el pago `PENDING` y lo resuelve el reconciliador consultando `getTransaction(idempotencyReference)`.
- **Razón**: tratar un timeout como rechazo permite cobrar al cliente dos veces si reintenta; el estado real es desconocido.
- **Descartado**: marcar `FAILED` en timeout (riesgo de doble cobro); reintentar el cobro automáticamente sin consulta previa.

## R-03 Idempotencia por clave y huella del cuerpo [Aprobar D-05]

- **Decisión**: tabla `idempotency_records` con índice único `(scope, key, caller_subject)`, huella SHA-256 del cuerpo canónico (claves ordenadas) y reproducción de la respuesta.
- **Razón**: patrón estándar para operaciones de dinero; `users-service` ya usa `IDEMPOTENCY_CONFLICT`.
- **Detalle**: el registro de idempotencia y el pago `PENDING` se crean juntos, de modo que la petición concurrente no vuelve a despachar. Una referencia opaca derivada de la operación se presenta al adaptador mock (no el token claro); en caso de timeout se conserva registro y bloqueo hasta resolución. La expiración del registro nunca libera un pago ambiguo. El segundo request puede recibir 202/409 de operación en vuelo según contrato, jamás generar un nuevo cobro.
- **Descartado**: caché Redis (no durable); deduplicar solo por `bookingId` (impide reintentos legítimos tras rechazo).

## R-04 Un pago activo por reserva con índice parcial único [Aprobar D-06]

- **Decisión**: `UNIQUE (booking_id) WHERE status IN ('PENDING','REVIEW_REQUIRED','APPROVED','PARTIALLY_REFUNDED')`.
- **Razón**: la restricción en base de datos es la defensa principal ante concurrencia y también impide reintentos de cargos inciertos; no se libera por agotar reconciliación.
- **Descartado**: validación solo en código (condición de carrera).

## R-05 Control de saldo en reembolsos

- **Decisión**: `SELECT … FOR UPDATE` sobre la fila de `payments` dentro de la transacción de reembolso, más `CHECK (refunded_amount_minor <= amount_minor)` como red de seguridad, más índice parcial para un solo reembolso `PENDING` por pago.
- **Razón**: dos reembolsos concurrentes no pueden exceder el pago. El `CHECK` garantiza la invariante aunque exista un error de código.
- **Descartado**: solo bloqueo optimista con `version` (reintentos complejos) y solo validación en dominio.

## R-06 Outbox transaccional para eventos [Aprobar D-09]

- **Decisión**: escribir el evento en `outbox_events` junto con el cambio de estado; un relay lo publica con confirmaciones del broker (publisher confirms) usando `FOR UPDATE SKIP LOCKED`, backoff y estado `DEAD`.
- **Razón**: evita el problema de doble escritura (commit sin evento o evento sin commit). La constitución IV exige "sin pérdida silenciosa".
- **Consecuencia**: entrega at-least-once; los consumidores deduplican por `eventId`. El orden se garantiza por `aggregate_id`, no global.
- **Descartado**: publicar directo tras el commit (se pierde el evento si el proceso cae); Debezium/CDC (complejidad fuera de alcance).

## R-07 Autenticación y autorización

- **Decisión**: replicar `users-service`: JWT de usuario RS256 de Auth (`iss`, `aud`, `kid`, `exp`) y JWT de servicio RS256 con scopes por ruta. Guards `ServiceAuthGuard` (con scope) y `RolesGuard`.
- **Scopes**: `payments:charge`, `payments:refund`, `payments:read`.
- **Razón**: coherencia con el resto del monorepo y con la constitución V (cross-user y cross-role bloqueados y probados).
- **Descartado**: API key estática; confiar en el body para identificar al pagador desde un usuario final [Aprobar D-01].

## R-08 Dinero en unidad menor [Aprobar D-03]

- **Decisión**: `amountMinor` JSON entero seguro hasta 9 000 000 000 000, `BIGINT`/Prisma `BigInt` en SQL y moneda ISO-4217; `Money` usa enteros seguros y comprueba overflow. `PAYMENTS_MAX_AMOUNT_MINOR` nunca supera el máximo técnico.
- **Razón**: evita errores de coma flotante y overflow de `INTEGER` PostgreSQL. **COP y USD tienen exponente ISO 4217 de 2**; 350.000 COP = 35.000.000 unidades menores y 100 USD = 10.000 unidades menores. La UI no debe confundir valor mayor y valor menor; si se desea prohibir fracciones de COP, sería otra regla comercial que el equipo debe aprobar (no se asume).
- **Descartado**: strings decimales (parseo y comparaciones propensas a error).

## R-09 Errores y códigos

- **Decisión**: `application/problem+json` con `code` estable, como `users-service`: `VALIDATION_ERROR` 400, `UNAUTHENTICATED` 401, `FORBIDDEN` 403, `NOT_FOUND` 404, `IDEMPOTENCY_CONFLICT` 409, `STATE_CONFLICT` 409, `REFUND_AMOUNT_INVALID` 422, `GATEWAY_UNAVAILABLE` 503.
- **Razón**: los consumidores ramifican por `code`, no por texto.

## R-10 Resiliencia ante la pasarela

- **Decisión**: timeout configurable (`PAYMENTS_GATEWAY_TIMEOUT_MS`, por defecto 5000) y circuit breaker; separar explícitamente fallo **pre-dispatch confirmado** (`503`, no cobró, reintento permitido) de timeout/desconexión **después de posible despacho** (`202 PENDING` y reserva de idempotencia); no reintentar cargo dentro de request.
- **Razón**: reintentar cobros dentro del request multiplica el riesgo de doble cobro; la recuperación es responsabilidad del reconciliador.

## R-11 Reconciliador

- **Decisión**: proceso interno con intervalo configurable, lotes reclamados con `FOR UPDATE SKIP LOCKED` y lease; **liberar la transacción antes de consultar la pasarela**. Resultado definitivo confirmado → estado final; sin evidencia tras el máximo de intentos → `REVIEW_REQUIRED` con motivo `RECONCILIATION_EXHAUSTED`, auditoría y evento; **no** `FAILED`. En revisión se conserva bloqueo contra nueva operación, sin reintentos ciegos. Para resolver revisión se requiere evidencia y proceso autorizado auditado. Patrón de scheduling/reclamación: Auth, no Search.
- **Descartado**: cron externo (más piezas operativas).

## R-12 Persistencia y migraciones

- **Decisión**: Prisma 6.19.0 como en Users/Search; SQL de migración manual para índices parciales y `CHECK`; contenedor `payments-migrate` separado, igual que `users-migrate`.
- **Nota**: la elección Prisma vs TypeORM ya está resuelta en el repo; no se reabre.
- **Tipos/contratos**: los `BIGINT` de Prisma se convierten a `number` solo tras validar que están en el rango seguro definido; las respuestas públicas nunca incluyen BigInt serializado directamente.
