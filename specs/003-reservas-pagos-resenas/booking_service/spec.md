# Especificación: bookings-service — Sprint 3

**Feature**: `booking_service`  
**Estado**: Base funcional para planificación técnica  
**Fecha**: 2026-11-05  
**Fuente de verdad**: `tendencias.md` RQ-07, RQ-08, RQ-09 y RQ-10; contribución técnica a RQ-11; constitución StayHub 1.0.0.

## 1. Objetivo

Construir el microservicio que sea autoridad transaccional de las reservas y de la disponibilidad real de habitaciones. Debe crear reservas sin sobreventa, conservar el precio aceptado, coordinar la orden de pago, permitir cancelaciones autorizadas, liberar disponibilidad, exponer el historial de reservas recibidas por un propietario y registrar check-in/check-out básico.

`search-service` conserva únicamente disponibilidad `PROJECTED`; toda confirmación debe revalidarse en `bookings-service`.

## 2. Alcance y trazabilidad

| Requisito | Cobertura de Bookings |
|---|---|
| RQ-07 Reservar una propiedad | Cobertura principal: huésped autenticado, habitación, fechas, capacidad, disponibilidad autoritativa, cálculo del total, reserva e inicio de orden de pago. |
| RQ-08 Histórico de reservas de mis propiedades | Cobertura principal: propietario autenticado, filtros por fecha, estado y huésped, sin consultar bases ajenas. |
| RQ-09 Cancelar reserva por huésped | Cobertura principal: ownership, estado cancelable, política versionada, liberación e inicio de reembolso cuando corresponda. |
| RQ-10 Cancelar reserva por propietario | Cobertura principal: propiedad propia, justificación obligatoria, liberación e inicio de reembolso completo. |
| RQ-11 Calificar una propiedad | Contribución parcial: informa autoritativamente si la estadía pertenece al huésped y está `COMPLETED`; `reviews-service` crea la reseña. |

## 3. Límites del servicio

Bookings es dueño de reservas, intervalos ocupados, estados, snapshots comerciales, historial de transiciones, idempotencia y eventos transaccionales. No procesa dinero, no almacena reseñas, no envía notificaciones, no administra propiedades y no consulta bases de otros servicios.

Fuera de alcance: tarifas estacionales, cupones, impuestos no definidos, varias monedas en una reserva, modificación de fechas, varias habitaciones por orden, lista de espera, no-show avanzado, frontend, pasarela real, reseñas y correo.

## 4. Actores y colaboradores

- **GUEST**: crea, consulta y cancela sus reservas.
- **OWNER**: consulta reservas recibidas, cancela con justificación y registra check-in/check-out.
- **ADMIN**: no recibe capacidades nuevas.
- **API Gateway**: autentica en el borde, enruta y propaga identidad confiable.
- **accommodations-service**: autoridad de propiedad, habitación, propietario, publicación, capacidad y precio base.
- **payments-service**: autoridad de orden, cobro y reembolso.
- **notifications-service** y **reviews-service**: consumidores futuros.
- **search-service**: proyección no autoritativa; no participa en la transacción.

## 5. Historias y criterios de aceptación

### US1 — Crear una reserva sin sobreventa (P1)

1. Exige `GUEST`, `propertyId`, `roomId`, `checkIn`, `checkOut`, `guests` e `Idempotency-Key`.
2. Las fechas son `[checkIn, checkOut)`, `checkOut > checkIn` y `checkIn` no es anterior a la fecha de negocio.
3. Accommodations confirma propiedad publicada, relación habitación-propiedad, propietario, capacidad y precio no nulo.
4. El total es `precioBasePorNoche × noches`; no se inventan impuestos ni cargos.
5. Se persiste un snapshot comercial inmutable.
6. Dos solicitudes concurrentes superpuestas no crean dos reservas activas; una recibe `409 BOOKING_CONFLICT`.
7. La misma clave idempotente y comando devuelve la misma reserva; contenido distinto produce `409 IDEMPOTENCY_CONFLICT`.
8. Nace `PENDING_PAYMENT`, bloquea el intervalo durante el plazo configurado e inicia una orden idempotente.
9. Pago confirmado cambia a `CONFIRMED`; fallo o expiración libera el intervalo.

### US2 — Consultar una reserva propia o recibida (P1)

1. Un huésped solo consulta sus reservas y un propietario solo las de su `ownerId` snapshot.
2. Un actor ajeno recibe `404`.
3. La respuesta contiene estado, fechas, huéspedes, snapshot, total, moneda y estado financiero resumido, sin secretos.

### US3 — Cancelar como huésped (P1)

1. Solo el huésped de la reserva puede cancelar.
2. La reserva debe estar en estado cancelable y cumplir la política versionada configurada por producto.
3. No se fijan plazos o porcentajes ausentes en `tendencias.md`; se registra `cancellationPolicyVersion` y el resultado.
4. La cancelación libera disponibilidad en la misma transacción que cambia el estado.
5. Si hay pago capturado, se publica una solicitud idempotente de reembolso.

### US4 — Historial y cancelación del propietario (P1)

1. El propietario obtiene reservas con paginación y filtros por fecha, estado y `guestId`.
2. Solo accede a filas cuyo snapshot `ownerId` sea el suyo.
3. Cancelar exige justificación no vacía y estado cancelable.
4. La cancelación libera disponibilidad y solicita reembolso completo cuando aplica.

### US5 — Check-in, check-out y elegibilidad de reseña (P2)

1. Solo el propietario de la reserva registra check-in/check-out.
2. Check-in requiere reserva confirmada y fecha coherente; check-out requiere check-in previo.
3. Check-out termina en `COMPLETED` y publica el hecho necesario para validar RQ-11.
4. No se implementan penalizaciones, no-show ni check-in temprano avanzado.

## 6. Requisitos funcionales

- **BKG-FR-001**: validar DTO cerrado y normalizar UUID, fechas y paginación.
- **BKG-FR-002**: autenticar y autorizar por rol, ownership y relación con la reserva.
- **BKG-FR-003**: obtener cotización reservable mediante REST interno documentado.
- **BKG-FR-004**: calcular noches y total con aritmética decimal exacta.
- **BKG-FR-005**: conservar snapshot comercial inmutable.
- **BKG-FR-006**: impedir solapamiento autoritativamente en PostgreSQL.
- **BKG-FR-007**: hacer idempotente creación e integraciones financieras.
- **BKG-FR-008**: coordinar `PENDING_PAYMENT → CONFIRMED|PAYMENT_FAILED|EXPIRED`.
- **BKG-FR-009**: consultar detalle con no divulgación entre usuarios.
- **BKG-FR-010**: consultar historial del propietario con filtros y orden determinista.
- **BKG-FR-011**: cancelar como huésped aplicando política versionada.
- **BKG-FR-012**: cancelar como propietario con justificación y reembolso completo cuando aplique.
- **BKG-FR-013**: registrar check-in y check-out básico.
- **BKG-FR-014**: publicar eventos mediante Outbox y consumir con Inbox/idempotencia.
- **BKG-FR-015**: exponer elegibilidad interna de reseña basada en `COMPLETED`.
- **BKG-FR-016**: registrar historial auditable de transiciones sin secretos financieros.

## 7. Estados

```text
PENDING_PAYMENT ──payment.confirmed──> CONFIRMED ──check-in──> CHECKED_IN ──check-out──> COMPLETED
       │                                  │
       ├──payment.failed──> PAYMENT_FAILED├──cancel guest──> CANCELLED_BY_GUEST
       └──hold expired───> EXPIRED        └──cancel owner─> CANCELLED_BY_OWNER
```

Los estados terminales liberan inventario salvo `COMPLETED`, cuyo intervalo ya terminó. El estado del reembolso se registra por separado.

## 8. Requisitos no funcionales

- **BKG-NFR-001 Seguridad**: JWT RS256, service JWT, mínimo privilegio, validación cerrada y logs seguros.
- **BKG-NFR-002 Consistencia**: PostgreSQL es autoridad; no se usan locks Redis para impedir sobreventa.
- **BKG-NFR-003 Resiliencia**: timeouts, retry limitado y Outbox/Inbox sin pérdida silenciosa.
- **BKG-NFR-004 Disponibilidad**: `restart: always`, healthchecks y apagado ordenado.
- **BKG-NFR-005 Contratos**: OpenAPI/JSON Schema versionados y pruebas de drift/provider-consumer.
- **BKG-NFR-006 Observabilidad**: trazas, logs y métricas de conflictos, holds, eventos y dependencias.
- **BKG-NFR-007 Verificación**: cobertura mínima 70 % y pruebas reales PostgreSQL/RabbitMQ/Compose.
- **BKG-NFR-008 Rendimiento**: detalle e historial p95 < 500 ms bajo perfil reproducible.
- **BKG-NFR-009 Portabilidad**: Node 20, Docker y Docker Compose.

## 9. Contratos externos requeridos

1. Accommodations booking quote interno con service JWT y snapshot reservable.
2. Payments order idempotente y eventos de confirmación/fallo/reembolso.
3. Gateway con identidad confiable y Problem Details preservado.
4. RabbitMQ con eventos versionados, ack posterior a commit, retry limitado y DLQ.

Hasta que existan los colaboradores, las pruebas usan adaptadores contractuales; eso no constituye evidencia end-to-end.

## 10. Decisiones de producto no inventadas

- El plazo del hold de pago es configuración obligatoria, sin valor productivo fijado aquí.
- La política de cancelación es versionada; plazos y porcentajes requieren aprobación de producto.
- Solo se calcula tarifa base por noches porque otros cargos no están definidos.
- Una reserva cubre una habitación; ampliar exige un requisito nuevo.

