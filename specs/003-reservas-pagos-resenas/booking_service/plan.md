# Implementation Plan: bookings-service — Sprint 3

**Branch context**: `booking_service` (Spec Kit); checkout actual `search_service`  
**Date**: 2026-11-05  
**Spec**: `specs/003-reservas-pagos-resenas/booking_service/spec.md`  
**Scope**: backend exclusivo de `bookings-service`; no implementa frontend, Payments, Reviews, Notifications ni cambios de negocio en Accommodations.

## Estado de implementación — corte 2026-11-11

- Completadas y verificadas todas las tareas salvo **T097 Gateway↔Bookings real**: Setup, Foundation, US1–US5, evidencia PostgreSQL real, cobertura 74.32 %, contratos, Compose/CI, E2E aislado, rendimiento y shutdown ordenado.
- Evidencia local: lint, typecheck y build; migración real PostgreSQL 16; concurrencia GiST, idempotencia y saga; 60 pruebas unitarias/contrato/seguridad/integración/concurrencia; arranque con readiness/liveness/Swagger; imagen Docker reproducible.
- Las integraciones reales con `accommodations-service`, `payments-service`, `notifications-service` y `reviews-service` pasaron en `npm run test:unir:e2e` con **8/8 escenarios**. El harness ya no utiliza stub de Accommodations.
- Pendiente únicamente **T097**: E2E con API Gateway real y una política de rate limit aprobada. El proxy, JWT delegado, roles, trazas y Problem Details ya están implementados y cubiertos por pruebas locales. Ver `validation-report.md` y `quickstart.md`.

## 1. Summary

Implementar un microservicio NestJS en puerto interno 3005, con PostgreSQL propio y Prisma, que sea autoridad de reservas y disponibilidad transaccional. El núcleo usa un agregado `Booking`, intervalos `[checkIn,checkOut)`, constraint GiST para impedir sobreventa, snapshots de cotización, idempotencia HTTP, saga de pago, Outbox/Inbox RabbitMQ y autorización por identidad propagada desde Gateway.

La feature cubre RQ-07–RQ-10 y aporta a RQ-11 únicamente la evidencia de estadía completada. El plan puede desarrollarse contra contratos y dobles mientras Accommodations agrega el quote interno y Payments se implementa; no se declarará integración end-to-end antes de probar esos servicios reales.

## 2. Technical Context

**Language/Version**: TypeScript 5.7 estricto, Node.js 20  
**Framework**: NestJS 10.4, RxJS 7.8  
**Persistence**: PostgreSQL 16, Prisma 6.19; SQL de migración para `btree_gist`, `daterange` y exclusion constraint  
**Messaging**: RabbitMQ 3 mediante `amqplib` o adaptador coherente con Search; mensajes JSON Schema v1  
**Security**: service JWT RS256, issuer/audience/kid/scope, identidad confiable del Gateway, roles `GUEST|OWNER`  
**Testing**: Jest 29, Supertest, PostgreSQL/RabbitMQ reales para integración, AJV/OpenAPI parser, pruebas de concurrencia y Compose  
**Target**: Linux containers; desarrollo Windows compatible; imagen Node 20 no-root  
**Project type**: microservicio web NestJS en monorepo  
**Performance**: detalle/historial p95 < 500 ms; errores inesperados < 1 % bajo perfil documentado  
**Availability**: servicio crítico con `restart: always`; DB requerida para readiness; RabbitMQ/colaboradores reportados con semántica explícita  
**Constraints**: sin acceso a DB ajena; sin Redis lock; sin impuestos/fees inventados; una habitación por reserva; política productiva de cancelación externa/versionada  
**Scale inicial**: paginación máxima 100; índices para historial; diseño horizontal sin estado local.

No quedan `NEEDS CLARIFICATION` técnicos. Los valores de política de cancelación y hold son configuración productiva obligatoria, no decisiones inventadas en este plan.

## 3. Constitution Check

### Pre-design gate

| Principio | Evaluación | Evidencia de diseño |
|---|---|---|
| I. Dominio por microservicio | PASS | Bookings solo posee reservas/disponibilidad; dinero, propiedades, reseñas y notificaciones permanecen separados. |
| II. Capas y dependencias | PASS | Dominio puro, casos de uso por puertos y adaptadores Nest/Prisma/HTTP/RabbitMQ externos. |
| III. Datos independientes | PASS | `bookings_db`; IDs externos sin FK; snapshots con owner y sincronización documentados. |
| IV. REST/eventos explícitos | PASS | Cotización inmediata por REST; hechos y resultados financieros por eventos; timeout/retry/DLQ. |
| V. Seguridad por defecto | PASS | JWT de servicio, roles/ownership, DTO cerrado, no-disclosure, secretos por archivo y pruebas adversariales. |
| VI. Código modular/tipado | PASS | TypeScript estricto y módulos cohesivos sin framework en dominio. |
| VII. Contratos documentados | PASS | OpenAPI Bookings/consumers y JSON Schema v1 con drift tests. |
| VIII. Verificación/trazabilidad | PASS | RQ-07–RQ-10 y RQ-11 parcial, unit/integration/contract/security/concurrency/e2e. |

### Post-design gate

**PASS**. `research.md`, `data-model.md`, `contracts/` y `quickstart.md` preservan límites, ownership, seguridad y evidencia. Las dependencias no implementadas están marcadas como externas y no se simularán como completas.

## 4. Project Structure

### Documentación

```text
specs/003-reservas-pagos-resenas/booking_service/
├── spec.md
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
├── contracts/
│   ├── openapi-bookings-service.yaml
│   ├── openapi-accommodations-booking-quote-consumer.yaml
│   ├── openapi-payments-consumer.yaml
│   └── booking-payment-events-v1.schema.json
└── tasks.md                         # posterior: $speckit-tasks
```

### Código previsto

```text
apps/bookings-service/
├── prisma/
│   ├── schema.prisma
│   └── migrations/
├── src/
│   ├── domain/
│   │   ├── bookings/
│   │   ├── availability/
│   │   ├── cancellations/
│   │   ├── money/
│   │   └── shared/
│   ├── application/
│   │   ├── ports/
│   │   ├── create-booking/
│   │   ├── get-booking/
│   │   ├── owner-history/
│   │   ├── cancel-booking/
│   │   ├── stay-lifecycle/
│   │   └── payments/
│   ├── infrastructure/
│   │   ├── config/
│   │   ├── persistence/prisma/
│   │   ├── http/
│   │   ├── messaging/
│   │   ├── security/
│   │   └── observability/
│   ├── interfaces/
│   │   ├── http/
│   │   ├── events/
│   │   └── openapi/
│   ├── modules/
│   ├── app.module.ts
│   └── main.ts
└── test/
    ├── unit/
    ├── integration/
    ├── contract/
    ├── security/
    ├── concurrency/
    ├── performance/
    └── e2e/
```

**Structure Decision**: replica la convención hexagonal real de los servicios existentes. `apps/bookings-service` se registra como workspace y proyecto Nest; no importa fuentes de otros servicios.

## 5. Responsabilidades por capa

### Domain

- `Booking` controla estados, fechas, actor, cancelación y check-in/out.
- `StayPeriod` normaliza `[checkIn,checkOut)` y noches.
- `Money` evita punto flotante y valida moneda/montos.
- `AvailabilityPolicy` expresa estados bloqueantes; PostgreSQL impone la garantía final.
- `CancellationPolicy` es puerto versionado; no contiene valores productivos inventados.
- Errores de dominio son estables y ajenos a HTTP/Prisma.

### Application

- Casos de uso: crear, consultar, historial, cancelar, check-in, check-out, expirar hold, confirmar/fallar pago, procesar reembolso y elegibilidad de reseña.
- Puertos: repositorio/UoW, reloj, IDs, `AccommodationQuotePort`, `PaymentOrdersPort`, `CancellationPolicy`, Outbox, Inbox y logger/telemetría.
- Orquesta saga sin mantener transacciones durante HTTP o RabbitMQ.

### Infrastructure

- Prisma/PostgreSQL implementa unidad de trabajo, constraint y queries paginadas.
- Cliente REST Accommodations y Payments con service JWT, timeout y mapeo seguro.
- RabbitMQ publica Outbox y consume eventos de Payments.
- Configuración fail-fast, OpenTelemetry, logs JSON y shutdown.

### Interfaces

- Controladores/DTOs traducen HTTP, no deciden negocio.
- Consumidores validan esquema antes del caso de uso.
- Problem Details preserva 400/401/403/404/409/429/503 y `traceId`.
- Swagger generado se compara con contrato fuente.

## 6. Fronteras entre servicios

| Servicio | Responsabilidad | Interacción con Bookings |
|---|---|---|
| Gateway | HTTPS, sesión, rate limit, identidad | REST público→interno, service JWT y headers reemplazados. |
| Auth/Users | Identidad/roles | No se llaman desde Bookings por request; Gateway entrega contexto confiable. |
| Accommodations | Propiedad/habitación/precio/owner | Quote REST síncrono antes del hold. |
| Search | Búsqueda proyectada | No autoriza reservas; futura proyección eventual de disponibilidad. |
| Payments | Orden/cobro/reembolso | REST idempotente para orden/refund y eventos de resultado. |
| Notifications | Mensajes | Consume eventos confirmados/cancelados; Bookings no envía email. |
| Reviews | Reseñas | Consulta elegibilidad o consume `booking.v1.completed`. |

Bookings no consulta `auth_db`, `users_db`, `accommodations_db`, `search_db` ni `payments_db`.

## 7. Flujos técnicos

### 7.1 Crear reserva

1. Gateway autentica GUEST y reemplaza headers de identidad.
2. Controller valida DTO cerrado e idempotency key.
3. Caso de uso reclama `IdempotencyRecord`; replay igual devuelve resultado.
4. `AccommodationQuotePort` obtiene snapshot reservable con timeout.
5. Dominio valida fechas/capacidad y calcula total decimal.
6. Transacción crea `Booking(PENDING_PAYMENT)`, transición, idempotencia, `PaymentWork` y Outbox.
7. Constraint GiST decide el solapamiento; se mapea a `409 BOOKING_CONFLICT`.
8. Worker solicita orden a Payments con clave derivada de `bookingId`.
9. Se guarda `paymentOrderId`; evento de Payments confirma o falla.
10. Reconciliador expira holds vencidos y publica la transición.

No se mantiene la transacción abierta durante pasos HTTP externos. Si falla Accommodations antes de crear, se responde `503`; si Payments falla después del commit, la reserva sigue `PENDING_PAYMENT` y el trabajo se reintenta hasta expirar.

### 7.2 Cancelación

1. Cargar reserva con lock/version y comprobar actor sin revelar filas ajenas.
2. OWNER requiere justificación; GUEST requiere decisión elegible de política.
3. Transacción registra `CancellationDecision`, estado terminal, transición, liberación y Outbox.
4. Si hay pago capturado, crear `PaymentWork(REQUEST_REFUND)` con modo `FULL` para OWNER o `POLICY` para GUEST.
5. Evento de refund actualiza solo `paymentStatus`; no reactiva inventario.

### 7.3 Historial

- Filtro obligatorio `ownerId=principal.sub` aplicado en repositorio.
- Filtros opcionales por solapamiento de fechas, estado y `guestId`.
- Orden `createdAt DESC,id DESC`, página 1..N y tamaño 1..100.
- Los datos históricos provienen del snapshot aun si la habitación cambia o desaparece.

### 7.4 Check-in/out y Reviews

- OWNER snapshot autoriza; estados válidos se aplican mediante máquina de estados.
- `COMPLETED` emite `booking.v1.completed` sin comentario/calificación.
- Reviews valida `bookingId+guestId` por endpoint interno o evento; la creación de reseña queda fuera.

## 8. Contratos HTTP

Contrato fuente: `contracts/openapi-bookings-service.yaml`.

| Método | Ruta | Actor | Uso |
|---|---|---|---|
| POST | `/bookings` | GUEST | Crear hold/reserva idempotente. |
| GET | `/bookings/:id` | GUEST/OWNER relacionado | Detalle autorizado. |
| DELETE | `/bookings/:id` | GUEST/OWNER relacionado | Cancelar; razón obligatoria para OWNER. |
| GET | `/bookings/history` | OWNER | Historial recibido con filtros. |
| POST | `/bookings/:id/check-in` | OWNER relacionado | Check-in básico. |
| POST | `/bookings/:id/check-out` | OWNER relacionado | Completar estadía. |
| GET | `/internal/v1/bookings/:id/review-eligibility` | Reviews service | Validar RQ-11 parcial. |

Gateway puede exponer prefijo público `/api/v1`; el servicio conserva rutas internas. No se agregan rutas frontend.

## 9. Persistencia, concurrencia e idempotencia

### Migraciones

1. Crear enums/tablas/constraints ordinarios desde Prisma.
2. Habilitar `btree_gist` de forma versionada.
3. Añadir `stayPeriod daterange` derivado o mantenido coherentemente.
4. Crear exclusion constraint GiST para estados bloqueantes.
5. Crear índices de detalle, historial, holds, PaymentWork, Outbox e Inbox.
6. Readiness comprueba conexión y lista exacta de migraciones; runtime nunca usa `db push`.

### Regla de disponibilidad

Solapamiento cuando `newStart < existingEnd AND newEnd > existingStart`. Rangos contiguos son permitidos. La aplicación puede hacer consulta diagnóstica, pero solo el constraint decide de manera autoritativa.

### Concurrencia adicional

- Versión optimista o `SELECT FOR UPDATE` para cancelar/check-in/out/eventos sobre la misma reserva.
- Estado e Outbox se confirman en una unidad de trabajo.
- Reclamo de PaymentWork mediante locking seguro para múltiples réplicas.
- Expirador usa lotes acotados y `SKIP LOCKED` cuando se justifique.

### Retención

Reservas/transiciones se conservan según política operativa futura. Idempotency/Inbox/Outbox publicados tienen retención documentada; no se purga trabajo activo ni se permite que un evento antiguo revierta un estado terminal.

## 10. Mensajería y saga

Contrato: `contracts/booking-payment-events-v1.schema.json`.

### Bookings produce

- `booking.v1.created`
- `booking.v1.confirmed`
- `booking.v1.cancelled`
- `booking.v1.completed`
- comandos de reembolso/orden cuando el contrato operativo elija REST+work o routing interno.

### Bookings consume

- `payment.v1.confirmed`
- `payment.v1.failed`
- `payment.v1.refund-completed`

Exchange/topic/colas/DLQ son versionados y durables. Mensajes persistentes, prefetch acotado, ack manual tras commit, backoff limitado y poison message a DLQ con metadata segura. `eventId` repetido con mismo hash es éxito idempotente; hash distinto es conflicto y no muta.

## 11. Seguridad

- Algoritmo permitido solo RS256; clave pública por `kid`, issuer/audience/scope exactos, expiración corta y clock skew acotado.
- Gateway elimina cualquier header de identidad entrante y genera contexto firmado; Bookings no confía en IDs del body para actor.
- GUEST no puede indicar `guestId`; OWNER no puede indicar `ownerId`.
- Ownership se aplica antes de devolver detalle/conflictos sensibles; recurso ajeno usa 404.
- Endpoint review-eligibility usa audiencia/scope interno separado.
- SQL crudo solo en adaptador/migración y siempre parametrizado.
- Logs no incluyen JWT, headers completos, motivos sensibles, payload financiero, SQL, secretos ni PII innecesaria.
- Rate limits del borde se coordinan para creación/cancelación; el servicio conserva idempotencia como defensa.
- Imagen no-root, secretos `_FILE`, redes internas y filesystem read-only salvo temporales necesarios.

## 12. Configuración e infraestructura

### Variables

- Puerto fijo 3005 y `BOOKINGS_DATABASE_URL[_FILE]`.
- Service JWT keys/issuer/audience/scope y credenciales de llamada a Accommodations/Payments.
- URLs/timeouts/retries de dependencias.
- Hold de pago obligatorio y versión/config de política de cancelación.
- RabbitMQ URL/exchange/queue/DLQ/prefetch/retries.
- límites de paginación, lotes y shutdown.
- OTLP endpoint, service name y log level.

Toda configuración se valida al arranque; secretos ausentes fallan cerrado.

### Docker Compose

- `bookings-db`: PostgreSQL 16, volumen propio y healthcheck.
- `bookings-migrate`: migración deploy antes del servicio.
- `bookings-service`: puerto interno 3005, healthcheck, `restart: always` y redes mínimas.
- RabbitMQ compartido con vhost/usuario/permisos de mínimo privilegio.
- Dependencias externas con condiciones de salud solo donde no produzcan ciclos; readiness distingue DB obligatoria de integración degradada.

Registrar workspace, scripts raíz, `nest-cli.json`, `tsconfig.base.json`, lockfile, `.env.example`, Dockerfile, Compose y CI sin romper servicios existentes. Accommodations sigue necesitando su propia integración raíz; no se oculta esa deuda dentro de Bookings.

## 13. Observabilidad y operación

- Logs JSON: operación, ruta, estado, duración, bookingId seguro, transición, traceId/eventId y dependencia; sin payload completo.
- Métricas: latencia por endpoint, creación/conflicto, holds activos/expirados, cancelaciones por actor, outbox lag, redelivery/DLQ, dependency failures y transición inválida.
- Traces: Gateway→controller→use case→DB/Accommodations/Payments y RabbitMQ→Inbox→transacción.
- `/health/live` verifica proceso; `/health/ready` exige configuración, DB y migraciones. RabbitMQ/colaboradores se reportan con estado explícito sin afirmar capacidad financiera cuando están caídos.
- Shutdown deja de aceptar tráfico, detiene consumers/workers, espera trabajo acotado, cierra broker/DB y termina dentro del grace period.

## 14. Estrategia de pruebas

### Unitarias

- fechas `[)`, noches, capacidad, dinero, total y snapshots;
- máquina de estados y eventos tardíos;
- cancelación por actor/política;
- idempotencia/hashes y mapeo de errores;
- filtros/paginación y autorización.

### Integración

- migraciones PostgreSQL reales, CHECKs e índices;
- dos inserts concurrentes superpuestos: uno gana y otro 409;
- intervalos contiguos, estados liberados y expiración;
- UoW con transición/Outbox e Inbox duplicate/conflict;
- RabbitMQ real: ack, redelivery, retry, DLQ y restart;
- clientes HTTP con timeout/503/Problem Details.

### Contrato

- OpenAPI 3.1 válido y sin drift;
- consumer contracts Accommodations/Payments;
- JSON Schema para todos los eventos y fixtures provider-consumer;
- compatibilidad de status/códigos/fechas/dinero.

### Seguridad

- alg/kid/iss/aud/exp/scope, tokens ausentes/forjados;
- header spoofing, ownership y precedencia 401/403/404;
- campos desconocidos, inyección, límites y redacción.

### E2E/Compose

- crear→orden→pago confirmado→check-in→check-out;
- crear→cancelar GUEST→refund;
- crear→cancelar OWNER con razón→refund completo;
- historial y aislamiento entre propietarios;
- reinicio entre commit y publicación/llamada remota.

### Rendimiento

Dataset reproducible, creación concurrente y consultas de detalle/historial; p95 de consultas < 500 ms. No se falsea evidencia con repositorios en memoria.

## 15. Dependencias y paralelización

```text
Spec + contratos congelados
├── workspace/config/Docker
├── dominio + puertos + unit tests
└── Prisma/migraciones + integration harness

Dominio + DB
├── crear/disponibilidad/idempotencia
├── detalle/historial
└── cancelación/check-in/out

Contratos externos
├── Accommodations quote ──> integración real de creación
├── Payments API/eventos ──> confirmación/reembolso end-to-end
└── Gateway routes ────────> e2e público

Casos de uso + adaptadores
├── OpenAPI/seguridad/contrato
├── Outbox/Inbox/workers
└── observabilidad/rendimiento/Compose
```

Puede avanzar en paralelo:

- dominio/casos de uso contra puertos falsos;
- esquema/migraciones y harness PostgreSQL;
- contratos/DTOs/OpenAPI;
- Docker/config/observabilidad después de congelar variables.

No puede cerrarse como completo sin:

- endpoint real Accommodations booking quote;
- contrato/servicio Payments operativo;
- rutas Gateway y prueba de identidad;
- política de cancelación productiva aprobada;
- Compose y pruebas conjuntas.

## 16. Fases de implementación propuestas

### Fase 0 — Contratos y gates

- Aprobar spec, OpenAPI y eventos.
- Acordar quote con Accommodations, identidad Gateway y Payments.
- Definir responsables y versionado de política de cancelación/hold.

### Fase 1 — Fundación

- Workspace, Nest project, config, health, logger, tracing, Dockerfile y CI.
- Prisma client, base/secret/migración job y test harness.

### Fase 2 — Dominio y disponibilidad

- Value objects, agregado, estados, errores, puertos y unit tests.
- Schema, exclusion constraint, repositorio/UoW y concurrencia real.

### Fase 3 — RQ-07

- Quote adapter, cálculo/snapshot, idempotencia, creación y detalle.
- PaymentWork, orden, expirador de holds y eventos de confirmación/fallo.

### Fase 4 — RQ-08

- Historial del propietario, filtros, paginación e índices.
- Ownership/no-disclosure y performance de consultas.

### Fase 5 — RQ-09/RQ-10

- Política versionada, cancelación GUEST/OWNER, razón, liberación y refund work.
- Eventos y compensación/reconciliación.

### Fase 6 — Ciclo de estadía/RQ-11 parcial

- Check-in/out básico y endpoint/evento de elegibilidad.
- No ampliar a reseñas o notificaciones.

### Fase 7 — Integración y hardening

- Gateway/Accommodations/Payments reales, Compose, seguridad, contrato, E2E, rendimiento y documentación de evidencia.

## 17. Estimación de referencia

`tendencias.md` asigna directamente a Bookings 32 horas: disponibilidad/reservas 16 h, cancelaciones 10 h e historial 6 h. Se conserva como referencia funcional, no como promesa detallada. Las 8 h de RabbitMQ y 12 h E2E son compartidas por varios servicios y no se atribuyen íntegramente a Bookings sin planificación conjunta. Check-in/out no tiene desglose propio; no se inventan horas adicionales en este plan.

## 18. Riesgos y mitigaciones

| Riesgo | Mitigación |
|---|---|
| Doble reserva bajo concurrencia | Exclusion constraint real y prueba simultánea PostgreSQL. |
| Cotización cambia entre consulta y reserva | Snapshot/version; Accommodations valida reservable; Bookings garantiza disponibilidad local. |
| Habitación eliminada con reserva futura | Snapshot histórico y dependencia para inactivar/consultar reservas antes de borrar. |
| Caída tras crear hold y antes de Payments | PaymentWork persistente, reconciliador, idempotencia y expiración. |
| Evento duplicado/desordenado | Inbox, hash, máquina monotónica y no-op idempotente. |
| Pago confirmado después de expiración | Regla contractual de evento tardío y compensación/refund; nunca reactivar silenciosamente. |
| Política de cancelación indefinida | Puerto/config versionados; bloquea cierre productivo, no el núcleo técnico. |
| OwnerId oculto en GET público | Quote interno de mínimo privilegio; no ampliar exposición pública. |
| Tasks de Accommodations parcialmente abiertas | Tratar integración raíz/Compose/Gateway como dependencia verificable. |
| Acoplar Bookings a servicios inexistentes | Puertos + consumer contracts; evidencia aislada claramente etiquetada. |
| Confundir Search con disponibilidad real | Search continúa `PROJECTED`; Bookings revalida siempre. |

## 19. Trazabilidad de diseño

| Requisito | Componentes | Evidencia mínima |
|---|---|---|
| RQ-07 | create use case, quote, Money, GiST, idempotency, Payments saga | concurrencia + contrato + integración + E2E de pago |
| RQ-08 | owner history query/indices/authorization | filtros, paginación, aislamiento, p95 |
| RQ-09 | guest cancellation, policy, refund work | ownership, eligible/ineligible, release, retry |
| RQ-10 | owner cancellation, justification, full refund | ownership, reason, release, refund FULL |
| RQ-11 parcial | check-out, eligibility API/event | solo huésped/propiedad completed |

## 20. Criterios técnicos de terminado

- Spec, plan, data model, OpenAPI y eventos aprobados y sin drift.
- Workspace/CI/build/lint/typecheck operativos con Node 20.
- Migraciones reproducibles desde cero; no `db push` runtime.
- Constraint demuestra ausencia de sobreventa bajo concurrencia.
- RQ-07–RQ-10 tienen pruebas positivas, negativas, autorización, fallos y trazabilidad.
- RQ-11 se declara parcial y no crea reseñas.
- REST y RabbitMQ son idempotentes; Outbox/Inbox, retry y DLQ probados.
- Dependencias usan timeouts, mínimos privilegios y errores seguros.
- Cobertura afectada >= 70 %, sin sustituir integración/concurrencia/E2E.
- Docker Compose levanta DB, migrate, RabbitMQ y Bookings con healthchecks y `restart: always`.
- Contenedor no-root, secrets no versionados, shutdown limpio y observabilidad verificada.
- Integración real con Gateway/Accommodations/Payments se distingue de pruebas con stubs.
- Política de cancelación y hold productivos tienen versión/aprobación antes de liberar.
- Revisión por otro miembro y CI verde según constitución.

## Complexity Tracking

No se identifican violaciones constitucionales. Outbox/Inbox, PaymentWork y exclusion constraint responden a riesgos demostrados de consistencia distribuida; no son abstracciones generales sin uso.



