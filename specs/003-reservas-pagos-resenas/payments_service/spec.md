# Feature Specification: Payments Service de StayHub

**Feature Branch**: `feat/payments-service`  
**Created**: 2026-11-07  
**Status**: Draft revisado para implementación; decisiones D-01…D-13 pendientes de aprobación explícita del equipo  
**Source of truth**: `tendencias.md`, RQ-07 (parcial), RQ-09 (parcial), RQ-10 (parcial), Sprint 3 (tareas "Integración mock de pasarela de pago" y "Flujo de reembolsos"), RNF de Disponibilidad, Seguridad y Comunicación

## Alcance funcional

`payments-service` procesa el cobro de una reserva contra una pasarela de pago **simulada (mock)**, registra el estado de cada transacción, ejecuta reembolsos totales o parciales y permite consultar el estado de un pago. Publica hechos de negocio (`pago aprobado`, `pago rechazado`, `pago fallido`, `reembolso completado`, `reembolso fallido`) por RabbitMQ para que otros servicios reaccionen sin acoplarse.

El servicio **no** calcula totales, **no** verifica disponibilidad, **no** decide políticas de cancelación y **no** envía notificaciones. Esas responsabilidades pertenecen a `bookings-service` y `notifications-service`. Payments recibe un monto ya calculado y una orden de reembolso ya decidida, y aplica controles para evitar operaciones duplicadas, mantener la consistencia de saldos y permitir auditoría. Un resultado desconocido **nunca** se convierte en rechazo por simple agotamiento de reintentos.

`bookings-service` todavía no existe en el repositorio. El comportamiento se valida con fixtures y mensajes contractuales; la integración real queda diferida (mismo enfoque que `search-service`).

### Requisitos fuente

| Fuente | Cobertura de este incremento | Estado honesto |
|---|---|---|
| **RQ-07 - Reservar una propiedad** | Payments cobra la orden de pago generada por Bookings y devuelve un resultado autoritativo (aprobado/rechazado/pendiente). | Contribución parcial. Disponibilidad, cálculo del total y creación de la reserva son de Bookings. No se declara RQ-07 cumplido end-to-end. |
| **RQ-09 - Cancelar reserva (huésped)** | Payments ejecuta el reembolso (total o parcial) que Bookings ordene según la política de cancelación. | Contribución parcial. La política y la liberación de disponibilidad son de Bookings. |
| **RQ-10 - Cancelar reserva (propietario)** | Payments ejecuta el reembolso **completo** cuando el motivo es cancelación del propietario. | Contribución parcial. La notificación al huésped es de Notifications. |
| **Sprint 3 - Integración mock de pasarela** | Puerto `PaymentGatewayPort` con adaptador mock determinista. | Requisito principal. |
| **Sprint 3 - Flujo de reembolsos** | Reembolso con validación de saldo, idempotencia y estados. | Requisito principal. |
| **RNF Disponibilidad** | `restart: always`, health checks, reconciliación de pagos pendientes. | Aplicable (servicio crítico). |
| **RNF Seguridad / Comunicación** | JWT, roles/scopes, validación estricta, REST síncrono + RabbitMQ para eventos. | Aplicable. |
| RQ-08, RQ-11, RQ-12 | Ninguna. | Fuera de alcance. |

## Decisiones propuestas (requieren aprobación del equipo)

La constitución exige aprobación explícita para comportamiento ausente de `tendencias.md`. Las opciones siguientes son **propuestas, no aprobaciones**. Codex debe solicitar aprobación de D-01…D-13 **antes de PAY-001**; si alguna cambia, se sincronizan spec, plan, modelo, contratos y tareas antes de codificar.

| ID | Decisión | Recomendada | Alternativa descartada |
|---|---|---|---|
| **D-01** | Quién llama `POST /payments` y `POST /payments/{id}/refund` | Solo JWT de servicio de Bookings (`payments:charge`, `payments:refund`). | Huésped llamando directo: permitiría pagar un monto arbitrario porque Payments no conoce el total de la reserva. |
| **D-02** | Quién consulta `GET /payments/{id}/status` | El pagador dueño (`sub == payerUserId`), un `ADMIN`, o un servicio con `payments:read`. Un usuario ajeno recibe 404. | Cualquier usuario autenticado: filtra existencia y estado de pagos ajenos. |
| **D-03** | Representación del dinero | `amountMinor` entero seguro en JSON y `BIGINT` en PostgreSQL + `currency` ISO-4217. COP y USD usan exponente ISO 4217 **2**: 100 unidades menores = 1 COP o 1 USD. Máximo técnico 9 000 000 000 000 y máximo de negocio configurable igual o inferior. | `float`/`decimal` en JSON: errores de redondeo. |
| **D-04** | Datos de tarjeta | Solo un token opaco (`CARD_TOKEN`). Payments nunca recibe, guarda ni registra PAN, CVV ni fecha de vencimiento. | Recibir datos de tarjeta: alcance PCI innecesario. |
| **D-05** | Idempotencia | Header `Idempotency-Key` (UUID) obligatorio en cobro y reembolso. Misma clave y mismo cuerpo reproduce la respuesta; mismo valor con cuerpo distinto responde `409`. | Sin idempotencia: doble cobro ante reintentos. |
| **D-06** | Un pago activo por reserva | Un pago `PENDING`, `REVIEW_REQUIRED`, `APPROVED` o `PARTIALLY_REFUNDED` bloquea otro cobro del mismo `bookingId` mediante índice parcial único. Un nuevo intento solo es posible tras un `DECLINED` confirmado o `FAILED` con evidencia definitiva de **no cobro**. | Varios pagos activos: doble cobro. |
| **D-07** | Reembolso parcial | Se permite `amountMinor` opcional (omitido = saldo completo reembolsable). Si el motivo es `OWNER_CANCELLATION`, solo se acepta el reembolso completo (RQ-10). | Solo reembolso total: no cubre "si aplica" de RQ-09 con políticas parciales. |
| **D-08** | Resultado de un rechazo | `201` con `status: DECLINED` y `failureCode` (es un resultado de negocio, no un error HTTP). Timeout ambiguo o posible despacho: `202` con `PENDING`. `503` solo si el adaptador demuestra que la operación **no** llegó a la pasarela (pre-dispatch). No liberar clave por una respuesta ambigua. | `402` para rechazos: obliga al llamador a tratar un resultado normal como excepción. |
| **D-09** | Eventos | Patrón outbox transaccional + exchange `topic` `stayhub.payments`, entrega at-least-once. | Publicar directo tras el commit: pérdida de eventos si el broker cae. |
| **D-10** | Pagos pendientes | Reconciliador periódico consulta el resultado autoritativo. Al agotar reintentos sin evidencia, pasa a `REVIEW_REQUIRED` (también para reembolsos), conserva el bloqueo y emite alerta/evento; nunca a `FAILED` por timeout. | Dejar pendientes manuales: pagos huérfanos. |
| **D-11** | Moneda del reembolso | Siempre la del pago original; no hay conversión. | Conversión de moneda: fuera de alcance. |
| **D-12** | Exposición pública | Payments no se publica en el API Gateway en este incremento. La consulta de estado por JWT de usuario es un **contrato interno** verificable en pruebas, no una funcionalidad accesible desde la web. La exposición al huésped requiere una integración futura de Gateway/Bookings y revisión de autorización. | Ruta pública directa: depende de D-01. |
| **D-13** | Recuperación determinista del mock | Adaptador mock con registro **durable, idempotente y sin tokens** de operaciones en `mock_gateway_operations`, exclusivo de desarrollo/pruebas. `getTransaction(operationRef)` devuelve el resultado conocido después de reiniciar. La escritura del simulador se hace fuera de la transacción de Payments y no sustituye la pasarela real. | Mock solo en memoria: no permite probar con fidelidad una caída entre cargo y persistencia. |

## Historias de usuario y pruebas

### Historia 1 - Cobrar una reserva (Prioridad P1)

Como `bookings-service`, quiero cobrar el total de una reserva y recibir un resultado autoritativo para confirmar o rechazar la reserva.

**Prueba independiente**: con la pasarela mock, enviar cobros con tokens de aprobación, rechazo y timeout, y comprobar estado final, respuesta HTTP y registro persistido.

**Criterios de aceptación**:

1. Dado un cobro válido con token aprobable, cuando se envía `POST /payments`, entonces se persiste un pago `APPROVED`, se responde `201` y se encola el evento `payment.v1.approved`.
2. Dado un token rechazable, el pago queda `DECLINED` con `failureCode` estable, se responde `201` y se encola `payment.v1.declined`.
3. Dado un timeout ambiguo de la pasarela, el pago queda `PENDING` y se responde `202`. El reconciliador podrá resolverlo con evidencia de la pasarela; si no existe tras agotar el presupuesto, quedará `REVIEW_REQUIRED` sin permitir otro cobro automático (Historia 5).
4. Dada la misma `Idempotency-Key` y el mismo cuerpo, se devuelve la misma respuesta sin una segunda llamada a la pasarela.
5. Dada la misma clave con cuerpo distinto, se responde `409 IDEMPOTENCY_CONFLICT`.
6. Dado un `bookingId` con pago `PENDING`, `REVIEW_REQUIRED`, `APPROVED` o `PARTIALLY_REFUNDED`, un nuevo cobro responde `409 STATE_CONFLICT`, incluso si caducó la retención nominal de idempotencia.
7. Dado un monto no positivo, una moneda no permitida, campos desconocidos o un token con formato inválido, se responde `400 application/problem+json` sin llamar a la pasarela.
8. Dado un llamador sin JWT de servicio válido o sin el scope `payments:charge`, se responde `401` o `403` sin tocar la base de datos.

### Historia 2 - Consultar el estado de un pago (Prioridad P1)

Como pagador, administrador o servicio autorizado, quiero consultar el estado de un pago para mostrarlo o decidir el siguiente paso.

**Prueba independiente**: crear pagos en cada estado y consultar con cada tipo de llamador.

**Criterios de aceptación**:

1. Dado un pago existente y el pagador dueño, `GET /payments/{id}/status` responde `200` con estado, monto, moneda y total reembolsado.
2. Un `ADMIN` o un servicio con `payments:read` puede consultar cualquier pago.
3. Un usuario que no es el pagador recibe `404`, indistinguible de un pago inexistente.
4. La respuesta nunca incluye token de pago, referencia interna de pasarela ni datos de otros usuarios y lleva `Cache-Control: no-store`.
5. Un identificador malformado responde `400`; uno inexistente, `404`.

### Historia 3 - Reembolsar un pago (Prioridad P1)

Como `bookings-service`, quiero reembolsar total o parcialmente un pago aprobado cuando una reserva se cancela.

**Prueba independiente**: pagos aprobados con reembolsos secuenciales y concurrentes; verificar que la suma reembolsada nunca supera el monto pagado.

**Criterios de aceptación**:

1. Dado un pago `APPROVED`, un reembolso total deja el pago en `REFUNDED` y el reembolso en `COMPLETED`, y encola `payment.v1.refunded`.
2. Un reembolso parcial deja el pago en `PARTIALLY_REFUNDED` con el saldo reembolsable correcto.
3. Un monto mayor al saldo reembolsable responde `422 REFUND_AMOUNT_INVALID` sin llamar a la pasarela.
4. Con motivo `OWNER_CANCELLATION`, un monto distinto del saldo completo responde `422`; sin monto, se reembolsa el saldo completo.
5. Un pago `DECLINED`, `FAILED`, `PENDING`, `REVIEW_REQUIRED` o ya `REFUNDED` responde `409 STATE_CONFLICT`.
6. Dos reembolsos concurrentes que juntos excederían el monto: exactamente uno se aplica y el otro falla con `422` o `409`; el total nunca supera el pago.
7. La misma `Idempotency-Key` con el mismo cuerpo no duplica el reembolso; con cuerpo distinto responde `409`.
8. Si la pasarela rechaza definitivamente el reembolso, queda `FAILED`, el saldo no cambia y se encola `payment.v1.refund_failed`. Si hay timeout/resultado ambiguo queda `PENDING`, luego `REVIEW_REQUIRED` si se agotan consultas sin evidencia; el saldo y el bloqueo no se liberan.

### Historia 4 - Publicar eventos de pago de forma confiable (Prioridad P2)

Como servicio consumidor (Bookings, Notifications), quiero recibir hechos de pago versionados y sin pérdida para reaccionar a ellos.

**Prueba independiente**: con RabbitMQ real aislado, provocar caídas del broker y verificar que cada evento se entrega al menos una vez, sin perderse.

**Criterios de aceptación**:

1. Cada cambio definitivo de estado y cada escalamiento a `REVIEW_REQUIRED` escribe su evento en `outbox_events` **en la transacción que guarda ese cambio**, incluso si el relay RabbitMQ aún no se ha implementado (US1/US3).
2. El relay publica con confirmación del broker y solo entonces marca el evento como publicado.
3. Con el broker caído, los eventos se acumulan y se publican al recuperarse, en orden por `paymentId`.
4. Los eventos cumplen el esquema `payment-events-v1.schema.json` y no contienen token, datos de tarjeta ni correo.
5. Tras el máximo de reintentos, el evento pasa a `DEAD`, se emite una métrica y nunca se descarta en silencio.

### Historia 5 - Reconciliar pagos y reembolsos pendientes (Prioridad P2)

Como operador, quiero que los pagos y reembolsos en `PENDING` se resuelvan solos para que ninguna reserva quede bloqueada.

**Prueba independiente**: crear pagos `PENDING` antiguos y simular que la pasarela mock ya los aprobó o rechazó.

**Criterios de aceptación**:

1. Un pago `PENDING` anterior al umbral se consulta en la pasarela y pasa a `APPROVED` o `DECLINED` con su evento; un reembolso `PENDING` pasa a `COMPLETED` o `FAILED` con el suyo.
2. Si la pasarela sigue sin resultado verificable, el recurso pasa a `REVIEW_REQUIRED` con código de motivo `RECONCILIATION_EXHAUSTED` y se encola `payment.v1.review_required` o `payment.v1.refund_review_required`. **No se libera el bloqueo ni se permite repetir el dinero.** `FAILED` exige evidencia definitiva de operación no ejecutada o rechazo definitivo aplicable.
3. Dos instancias del reconciliador no procesan el mismo pago a la vez.
4. Un pago o reembolso ya resuelto no se modifica. La salida de `REVIEW_REQUIRED` requiere evidencia autoritativa, registro auditable y acción explícita autorizada; sin evidencia, permanece bloqueado y se informa al operador, nunca se reintenta el cargo/reembolso ciegamente.

## Requisitos funcionales

- **PAY-FR-001**: MUST exponer `POST /payments`, `POST /payments/{id}/refund` y `GET /payments/{id}/status` con los paths de `tendencias.md`.
- **PAY-FR-002**: MUST cobrar mediante `PaymentGatewayPort`; el adaptador mock es determinista y no realiza llamadas de red.
- **PAY-FR-003**: MUST modelar el dinero como entero seguro en JSON, `BIGINT` en SQL y moneda ISO-4217 configurable; COP y USD usan dos decimales (centésimas), máximo técnico 9 000 000 000 000 unidades menores sin conversiones implícitas.
- **PAY-FR-004**: MUST aceptar únicamente un token opaco de método de pago y rechazar cualquier campo desconocido.
- **PAY-FR-005**: MUST exigir `Idempotency-Key` en cobro y reembolso, con huella SHA-256 del cuerpo canónico y retención configurable.
- **PAY-FR-006**: MUST garantizar a lo sumo un pago activo o de resultado desconocido por `bookingId` mediante restricción de base de datos, no solo validación en código.
- **PAY-FR-007**: MUST aplicar una máquina de estados explícita y rechazar transiciones inválidas en el dominio.
- **PAY-FR-008**: MUST garantizar `refundedAmountMinor <= amountMinor` con control transaccional y restricción `CHECK` en base de datos.
- **PAY-FR-009**: MUST validar reglas mecánicas de reembolso (estado, saldo, motivo `OWNER_CANCELLATION` = completo) y NO decidir políticas de cancelación.
- **PAY-FR-010**: MUST registrar historiales inmutables de transiciones de estado de pagos **y reembolsos**; las transiciones a/desde REVIEW_REQUIRED quedan auditadas con evidencia no sensible cuando exista.
- **PAY-FR-011**: MUST escribir eventos en `outbox_events` en la misma transacción del cambio de estado y publicarlos por RabbitMQ con confirmación.
- **PAY-FR-012**: MUST aplicar timeouts y circuit breaker a la pasarela y tratar el timeout como resultado ambiguo (`PENDING`), no como rechazo.
- **PAY-FR-013**: MUST reconciliar pagos y reembolsos `PENDING` con consultas autoritativas y reclamación de trabajo (`SKIP LOCKED` + lease o equivalente), sin retener bloqueos SQL durante llamadas externas.
- **PAY-FR-014**: MUST autenticar con JWT RS256 (usuario y servicio), validar `iss`, `aud`, `kid`, expiración y scopes/roles igual que `users-service`.
- **PAY-FR-015**: MUST responder errores con `application/problem+json` y códigos estables, sin filtrar trazas ni datos internos.
- **PAY-FR-016**: MUST poseer su base `payments_db` y no leer ni escribir en la base de otro servicio.
- **PAY-FR-017**: MUST exponer `/health/live` y `/health/ready` (base de datos, migración, broker degradado sin bloquear lecturas).
- **PAY-FR-018**: MUST documentar REST en OpenAPI 3.1 y los eventos en JSON Schema, sincronizados con la implementación.
- **PAY-FR-019**: MUST escalar la incertidumbre agotada a `REVIEW_REQUIRED` (pago/reembolso), conservar unicidad y bloqueo de reembolso, generar evento auditable y exigir evidencia antes de resolver manualmente.
- **PAY-FR-020**: MUST disponer de un mock durable para desarrollo/pruebas, con consulta por referencia opaca e idempotencia independiente del ciclo de vida del proceso; jamás persiste PAN, CVV ni token claro.

## Requisitos no funcionales

- **PAY-NFR-001 Rendimiento**: `GET /payments/{id}/status` p95 < 500 ms; cobro con mock sin latencia artificial p95 < 500 ms.
- **PAY-NFR-002 Disponibilidad**: servicio crítico con `restart: always`; arranca con la base disponible aunque RabbitMQ esté caído.
- **PAY-NFR-003 Seguridad**: sin PAN/CVV; logs con redacción recursiva de `token`, `authorization` y `idempotency-key`; consultas SQL parametrizadas; pruebas de acceso entre usuarios.
- **PAY-NFR-004 Integridad**: ningún escenario de reintento, concurrencia, caída o incertidumbre agotada debe autorizar doble cobro o reembolso superior al pago; la respuesta desconocida nunca cuenta como fallo probado.
- **PAY-NFR-005 Mantenibilidad**: capas `domain`/`application`/`infrastructure`/`interfaces` como `users-service`; TypeScript estricto; alias `@payments/*`.
- **PAY-NFR-006 Portabilidad**: levanta con `docker compose` con su base, migración y health checks.
- **PAY-NFR-007 Verificabilidad**: cobertura global ≥ 70 %; pruebas unit, integration, contract y security; pruebas de concurrencia reales contra PostgreSQL 16.
- **PAY-NFR-008 Observabilidad**: trazas OTLP, métricas de cobros, rechazos, reembolsos, latencia de pasarela, `outbox` pendiente y muertos.

## Casos límite

- Cobro repetido por un reintento de red del llamador (misma clave) mientras el primero sigue en vuelo: el segundo espera o recibe `409 STATE_CONFLICT` con indicación de reintento, nunca cobra dos veces.
- La pasarela aprueba pero el servicio cae antes de persistir: el reconciliador recupera el resultado por la referencia de idempotencia enviada a la pasarela.
- Reembolso de un pago cuyo reembolso previo quedó `PENDING`: se rechaza con `409` hasta que se resuelva.
- Reloj desfasado en JWT de servicio: se aplica la misma tolerancia que `users-service`.
- Moneda no soportada, monto no entero/seguro, unidad mal interpretada o monto que excede el máximo configurado: `400`. COP 350.000 = `amountMinor: 35000000` (dos decimales).
- Evento `DEAD` en `outbox_events`: queda visible para reproceso manual documentado. Un `DEAD` del relay **no** convierte el pago en `FAILED`.
- Un pago o reembolso `REVIEW_REQUIRED` no libera los índices parciales; la revisión auditada solo cambia estado con respuesta autoritativa de pasarela, nunca por expiración de TTL.

## Fuera de alcance

- Pasarela real (Stripe, PayU, Wompi, MercadoPago), webhooks reales, 3-D Secure y captura diferida.
- Cálculo de impuestos, comisiones, pagos al propietario (payouts) y conciliación contable.
- Políticas de cancelación y de reembolso (pertenecen a Bookings).
- Notificaciones al usuario (pertenecen a Notifications).
- Frontend, API Gateway público e implementación de `bookings-service`.
- Conversión de monedas y cobros recurrentes.

## Entidades clave

`Payment`, `Refund`, `IdempotencyRecord`, `OutboxEvent`, `PaymentStatusHistory`, `RefundStatusHistory` y `MockGatewayOperation` (solo desarrollo/pruebas). Ver `data-model.md`.

## Criterios de éxito

- Ningún escenario de prueba produce doble cobro ni reembolso mayor al pago, incluidos concurrencia y reintentos.
- Las Historias 1 a 3 pasan con PostgreSQL 16 real y la pasarela mock, y **encolan** eventos transaccionales. La publicación RabbitMQ, reconciliación autónoma y exposición web quedan como entregables posteriores, no se afirman completas en el corte MVP.
- Los contratos OpenAPI y de eventos validan con las pruebas de contrato.
- Cobertura ≥ 70 % y cero hallazgos de PAN, token o clave de idempotencia en logs.
- El servicio levanta con Docker Compose y reporta `ready` sin RabbitMQ.
