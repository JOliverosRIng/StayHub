# Quickstart de validación: bookings-service

Esta guía define evidencia esperada; no afirma que el código exista todavía.

## 1. Prerrequisitos

- Node 20, Docker Desktop y Docker Compose.
- PostgreSQL 16 para `bookings_db`.
- RabbitMQ 3 con vhost/usuario de mínimo privilegio.
- contratos en `contracts/` congelados.
- claves sintéticas de prueba; nunca secretos reales versionados.
- adaptadores contractuales de Accommodations y Payments mientras esos endpoints no estén integrados.

## 2. Configuración mínima

Variables previstas:

```text
BOOKINGS_PORT=3005
BOOKINGS_DATABASE_URL_FILE=/run/secrets/bookings_database_url
BOOKINGS_SERVICE_JWT_PUBLIC_KEYS_JSON=...
BOOKINGS_SERVICE_JWT_ISSUER=stayhub-gateway
BOOKINGS_SERVICE_JWT_AUDIENCE=stayhub-bookings-service
BOOKINGS_SERVICE_JWT_SCOPE=bookings:invoke
BOOKINGS_ACCOMMODATIONS_URL=http://accommodations-service:3003
BOOKINGS_PAYMENTS_URL=http://payments-service:3006
BOOKINGS_DEPENDENCY_TIMEOUT_MS=3000
BOOKINGS_PAYMENT_HOLD_MINUTES=<valor aprobado por producto/operación>
BOOKINGS_CANCELLATION_POLICY_VERSION=<versión aprobada>
BOOKINGS_RABBITMQ_URL_FILE=/run/secrets/bookings_rabbitmq_url
BOOKINGS_RABBITMQ_EXCHANGE=stayhub.bookings.v1
BOOKINGS_RABBITMQ_QUEUE=stayhub.bookings.payment-events.v1
BOOKINGS_RABBITMQ_DLQ=stayhub.bookings.payment-events.v1.dlq
OTEL_EXPORTER_OTLP_ENDPOINT=http://otel-collector:4318
```

La aplicación debe fallar al arranque si faltan valores obligatorios o son inválidos.

## 3. Gates locales previstos

```powershell
npm run prisma:bookings:generate
npm run lint:bookings
npm run typecheck:bookings
npm run test:bookings:unit
npm run test:bookings:contract
npm run build:bookings
```

Resultados: exit `0`, contrato OpenAPI/JSON Schema sin drift y cobertura de dominio afectado >= 70 %.

## 4. Migraciones y dependencias reales

```powershell
docker compose up -d bookings-db rabbitmq
npm run prisma:bookings:migrate:deploy
npm run test:bookings:integration
```

Verificar:

- migración desde base vacía;
- `btree_gist` y constraint de exclusión existentes;
- índices de huésped/propietario/hold/outbox;
- readiness `503` sin DB o migración y `200` con esquema correcto;
- RabbitMQ caído se refleja como degradación/indisponibilidad del flujo, sin pérdida silenciosa.

## 5. Escenario crítico: concurrencia

1. Preparar una cotización contractual para la misma habitación.
2. Enviar simultáneamente dos `POST /bookings` con huéspedes/claves distintas y fechas superpuestas.
3. Esperar una creación y un `409 BOOKING_CONFLICT`.
4. Confirmar una sola fila bloqueante y una sola orden de pago.
5. Repetir con rangos contiguos: `[1,3)` y `[3,5)` deben ser válidos.

Este escenario debe ejecutarse contra PostgreSQL real, no repositorio en memoria.

## 6. Idempotencia

- Mismo huésped, clave y payload: misma reserva y una orden de pago.
- Misma clave con payload distinto: `409 IDEMPOTENCY_CONFLICT`.
- Retry después de timeout de Payments: el reconciliador reusa la clave y no duplica la orden.

## 7. Pago y expiración

- `payment.v1.confirmed` válido: `PENDING_PAYMENT → CONFIRMED`.
- Evento duplicado: no-op idempotente.
- Evento con mismo `eventId` y hash distinto: conflicto/DLQ.
- `payment.v1.failed`: `PAYMENT_FAILED` y disponibilidad liberada.
- Hold vencido sin confirmación: `EXPIRED`; confirmación tardía se rechaza/compensa según contrato financiero.

## 8. Cancelación

- GUEST propio y política elegible: `CANCELLED_BY_GUEST`.
- GUEST ajeno: `404`.
- Política no elegible: `409 CANCELLATION_NOT_ALLOWED`.
- OWNER propio con justificación: `CANCELLED_BY_OWNER` y refund `FULL`.
- OWNER sin justificación: `400`.
- Cancelación repetida: resultado idempotente o conflicto estable, sin doble reembolso.

Los tests usan una política fixture; no presentan sus valores como política productiva.

## 9. Historial, check-in y review

- Historial filtra por `ownerId` snapshot, fecha, estado y huésped; no devuelve reservas ajenas.
- Orden y paginación son deterministas.
- Solo `CONFIRMED` admite check-in; solo `CHECKED_IN` admite check-out.
- Check-out produce `COMPLETED` y elegibilidad positiva solo para `guestId`/propiedad correctos.

## 10. Compose y seguridad

```powershell
docker compose up -d bookings-db bookings-migrate rabbitmq bookings-service
docker compose ps
```

Comprobar usuario no-root, filesystem de solo lectura cuando sea viable, `restart: always`, secrets por archivo, puerto 3005 solo interno, `/health/live`, `/health/ready`, SIGTERM limpio, JWT/issuer/audience/kid/scope, header spoofing, SQL parametrizado y Problem Details sin stack/hosts/payloads.

## 11. Rendimiento

Dataset reproducible con propietarios, huéspedes, habitaciones y reservas históricas/activas. Registrar seed, hardware, concurrencia y warmup. Detalle e historial deben demostrar p95 < 500 ms y errores inesperados < 1 %.

## 12. Evidencia diferida

No cerrar integración total hasta probar:

- Gateway ↔ Bookings;
- Bookings ↔ Accommodations quote real;
- Bookings ↔ Payments y eventos reales;
- eventos hacia Notifications/Reviews;
- flujo completo en Compose.

