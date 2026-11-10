# Research: bookings-service

## 1. Arquitectura interna

**Decisión**: continuar la arquitectura hexagonal/por capas usada por Auth, Users, Search y Accommodations: `domain`, `application`, `infrastructure`, `interfaces` y módulos NestJS de composición.

**Rationale**: cumple la constitución, permite probar reglas sin Nest/Prisma y conserva convenciones reales.

**Alternativas consideradas**: controladores con Prisma directo, rechazada por mezclar política y persistencia; DDD distribuido más complejo, rechazado por no aportar al alcance.

## 2. Autoridad de disponibilidad

**Decisión**: `bookings_db` es la autoridad transaccional. Search conserva solo `PROJECTED` y nunca autoriza una reserva.

**Rationale**: la decisión requiere observar reservas concurrentes, algo que una proyección eventual no puede garantizar.

**Alternativas**: validar solo Search, incorrecto; consultar Accommodations como calendario, rechazado porque ese servicio no posee reservas.

## 3. Exclusión de solapamientos

**Decisión**: PostgreSQL `daterange(checkIn, checkOut, '[)')` y constraint GiST de exclusión por `roomId` para estados que bloquean (`PENDING_PAYMENT`, `CONFIRMED`, `CHECKED_IN`). La migración SQL complementa Prisma.

**Rationale**: la base decide atómicamente incluso con réplicas de la aplicación. Intervalos contiguos son válidos.

**Alternativas**: `SELECT` antes de insertar tiene race condition; lock Redis añade otra autoridad y falla ante particiones; lock pesimista por habitación no cubre una habitación aún sin filas sin una tabla artificial.

## 4. ORM y persistencia

**Decisión**: Prisma 6.19 y PostgreSQL 16, versiones ya adoptadas. Prisma modela entidades ordinarias; migración SQL crea `btree_gist`, rango generado/expresión y constraint parcial. No se usa `db push`.

**Rationale**: consistencia con el monorepo y soporte de migraciones reproducibles.

## 5. Cotización de Accommodations

**Decisión**: REST síncrono interno `GET /internal/v1/properties/{propertyId}/rooms/{roomId}/booking-quote`, autenticado con service JWT. Devuelve propietario, publicación, capacidad, precio y versiones; rechaza habitación no publicada o sin precio.

**Rationale**: RQ-07 necesita respuesta inmediata y el GET público oculta `ownerId`. Bookings guarda el snapshot y no lee `accommodations_db`.

**Alternativas**: ampliar el GET público expondría datos; replicar todo Accommodations introduce proyección prematura; usar RabbitMQ para una cotización inmediata es inadecuado.

## 6. Cambios o eliminación de habitaciones

**Decisión**: reservas existentes sobreviven mediante snapshot. El contrato recomienda que Accommodations inactive antes de eliminar y consulte si existen reservas futuras; esa modificación pertenece a Accommodations y es dependencia externa, no tarea de Bookings.

**Rationale**: no se pueden crear FK entre bases ni borrar historia. Bookings rechaza nuevas cotizaciones inexistentes.

## 7. Flujo financiero

**Decisión**: saga orquestada por Bookings. Se crea `PENDING_PAYMENT` con hold transaccional; un adaptador idempotente solicita la orden a Payments fuera de la transacción; un reconciliador reintenta trabajo pendiente. Eventos `payment.confirmed|failed` actualizan la reserva. Reembolsos son solicitudes asíncronas idempotentes.

**Rationale**: no existe ACID distribuido y el documento asigna el dinero a Payments. No se mantiene una transacción DB durante una llamada remota.

**Alternativas**: confirmar antes del pago contradice el flujo; transacción distribuida 2PC no está contemplada; coreografía pura dificulta devolver/iniciar una orden y controlar expiración.

## 8. Outbox e Inbox

**Decisión**: cambios de reserva y `OutboxEvent` se confirman juntos. Un publisher entrega con confirmación; consumidores registran `ProcessedEvent` y hash. Ack solo después del commit, retry limitado y DLQ.

**Rationale**: RabbitMQ entrega al menos una vez y debe tolerarse duplicidad/reinicio.

## 9. Idempotencia HTTP

**Decisión**: `Idempotency-Key` obligatoria en creación; unicidad `(guestId, key)`, hash canónico del comando y respuesta/referencia persistida. Retención documentada y limpieza segura.

**Rationale**: retries del Gateway o cliente no deben duplicar holds ni pagos.

## 10. Precio y dinero

**Decisión**: monto decimal/string, una moneda ISO 4217, total `nightlyPrice × nights`, snapshot inmutable y sin `number` flotante. No se crean cargos no aprobados.

**Rationale**: Accommodations solo define tarifa base. Cualquier impuesto o fee requiere requisito nuevo.

## 11. Cancelación

**Decisión**: puerto `CancellationPolicy` con versión y resultado auditable. La configuración productiva de plazos/porcentajes es obligatoria y externa a esta feature; los tests usan fixtures explícitas. Cancelación del OWNER solicita reembolso total.

**Rationale**: RQ-09 menciona una política sin definirla; fijar valores sería inventar producto.

## 12. Autenticación y autorización

**Decisión**: el Gateway valida sesión y firma contexto; Bookings valida service JWT RS256 (`iss`, `aud`, `kid`, `exp`, scope) y solo confía en headers de identidad reemplazados por el Gateway. Endpoints internos usan audiencias/scopes separados.

**Rationale**: conserva el patrón existente y evita header spoofing.

## 13. API y cancelación HTTP

**Decisión**: conservar las rutas principales de `tendencias.md`: `POST /bookings`, `GET /bookings/{id}`, `DELETE /bookings/{id}`, `GET /bookings/history`. `DELETE` acepta justificación opcional/obligatoria según actor mediante body documentado. Check-in/out se expresan como comandos `POST /bookings/{id}/check-in|check-out` por estar en el entregable explícito.

**Alternativas**: `POST /cancel` sería más expresivo, pero diverge del endpoint principal ya publicado; se mantiene DELETE y se documenta el cuerpo.

## 14. Caché

**Decisión**: no incorporar Redis en v1. Índices PostgreSQL cubren detalle/historial y la consistencia domina.

**Rationale**: no existe necesidad demostrada; cachear disponibilidad añade invalidación peligrosa.

## 15. Operación y pruebas

**Decisión**: puerto 3005, Node 20, imagen multi-stage no-root, filesystem read-only cuando sea viable, `restart: always`, migración separada, health live/ready, shutdown ordenado. Pruebas unitarias, integración PostgreSQL/RabbitMQ, contrato, seguridad, concurrencia, rendimiento y Compose.

**Rationale**: restricciones de `tendencias.md` y Definition of Done constitucional.

## 16. Dependencias y evidencia

Accommodations existe localmente pero aún carece del quote interno, registro raíz/Compose e integración Gateway. Payments, Reviews y Notifications no existen. El desarrollo puede avanzar contra puertos y contratos; no se declarará integración real hasta probar servicios compuestos.

