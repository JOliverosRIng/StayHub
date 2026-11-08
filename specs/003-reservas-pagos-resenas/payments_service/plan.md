# Implementation Plan: Payments Service de StayHub

**Branch**: `feat/payments-service` | **Date**: 2026-11-07 | **Spec**: `specs/003-reservas-pagos-resenas/payments_service/spec.md`

**Input**: especificación derivada de `tendencias.md` (RQ-07, RQ-09, RQ-10 parciales; Sprint 3), constitución 1.0.0 y los patrones de `users-service` y `search-service`.

## Summary

Construir `payments-service` como microservicio NestJS independiente que cobra reservas contra una pasarela simulada, registra cada transacción con una máquina de estados explícita (incluida revisión de resultados inciertos), ejecuta reembolsos totales o parciales y publica hechos de pago por RabbitMQ mediante outbox transaccional. La solución prioriza **integridad del dinero** sobre funcionalidad: idempotencia obligatoria, un pago activo por reserva garantizado por índice parcial, saldo de reembolso protegido por bloqueo de fila más `CHECK`, y tratamiento de resultados ambiguos como `PENDING` y escalamiento a `REVIEW_REQUIRED` sin liberar unicidad tras agotar consultas. No depende de `bookings-service` (inexistente) ni de ninguna otra base de datos.

### Requisitos cumplidos por este desarrollo

| Requisito | Responsabilidad de Payments | Declaración de cumplimiento |
|---|---|---|
| **RQ-07** | Cobrar la orden de pago y devolver resultado autoritativo. | Contribución parcial verificable de forma aislada. Pendiente integración con Bookings. |
| **RQ-09** | Ejecutar el reembolso ordenado por Bookings (total o parcial). | Contribución parcial. La política es de Bookings. |
| **RQ-10** | Ejecutar el reembolso completo por cancelación del propietario. | Contribución parcial. La notificación es de Notifications. |
| **Sprint 3** | Pasarela mock y flujo de reembolsos. | Requisito principal. |
| **RNF Disponibilidad** | `restart: always`, health checks, reconciliador. | Gate técnico. |
| **RNF Seguridad** | JWT usuario y servicio, scopes, validación estricta, redacción de logs. | Gate técnico. |
| **RNF Rendimiento** | p95 < 500 ms en consulta y cobro con mock. | Gate técnico. |

## Technical Context

**Language/Version**: Node.js 20 LTS, TypeScript 5.7.3 estricto  
**Primary Dependencies**: NestJS 10.4.22, Prisma/@prisma/client 6.19.0, `class-validator` 0.14.2, `class-transformer` 0.5.1, `@nestjs/swagger` 8.1.1 (OpenAPI 3.1, como Search), `jsonwebtoken` 9.0.2 y Passport JWT (como Users), `amqplib` compatible con NestJS 10 para publisher confirms, OpenTelemetry (mismas versiones que Users)  
**Storage**: `payments_db` PostgreSQL 16 (`postgres:16-bookworm`, como `users-db`), una instancia exclusiva; `BIGINT` para dinero y ledger mock durable solo para dev/test  
**Testing**: Jest 29.7 con proyectos `unit`, `integration`, `contract`, `security`, `performance`; Supertest 7; PostgreSQL 16 y RabbitMQ 3 reales y desechables en integración  
**Target Platform**: contenedor Linux, red `payments-internal` + `services`  
**Project Type**: workspace npm `@stayhub/payments-service` dentro del monorepo  
**Performance Goals**: p95 < 500 ms en `GET /payments/{id}/status` y en cobro con mock sin latencia artificial  
**Constraints**: sin PAN/CVV; sin llamadas a la base de otro servicio; arranque aun con RabbitMQ caído; un solo cobro por clave de idempotencia  
**Scale/Scope**: 3 endpoints de negocio, 6 tablas de dominio/operación (incluye audit trail de refunds) + 1 ledger exclusivo del mock, 7 eventos, 1 reconciliador, 1 relay de outbox

**Nota de aprobación**: los PASS siguientes evalúan el *diseño propuesto*, no sustituyen la aprobación formal de D-01…D-13 ni implican código ya validado.

## Constitution Check

| Principio | Cumplimiento del plan | Estado |
|---|---|---|
| I. Microservicio por dominio | Solo dinero: cobro, reembolso, estado. Sin disponibilidad, políticas ni notificaciones. | PASS |
| II. Capas y dirección de dependencias | `domain` sin framework; `application` con puertos; `infrastructure` implementa puertos; controladores y consumidores solo traducen. | PASS |
| III. Datos propios | `payments_db` exclusiva; `bookingId` y `payerUserId` son identificadores opacos sin FK. | PASS |
| IV. Comunicación explícita | REST síncrono para cobro (el llamador necesita resultado inmediato); RabbitMQ para hechos con esquema, productor, consumidores, reintentos y manejo de fallos documentados. | PASS |
| V. Seguridad por defecto | JWT RS256, scopes por ruta, validación `forbidNonWhitelisted`, 404 para ajenos, pruebas de seguridad. | PASS |
| VI. Código tipado y modular | TypeScript estricto, alias `@payments/*`, `Money` como objeto de valor. | PASS |
| VII. Contratos documentados | OpenAPI 3.1 y JSON Schema de eventos en `contracts/`, verificados contra la implementación. | PASS |
| VIII. Verificación y trazabilidad | Dominio con unit tests; contratos e integración con base real; concurrencia, fallos y autorización cubiertos. | PASS |
| Docker Compose y `restart: always` | Servicio crítico con `restart: always`, migración separada y health check. | PASS |

## Project Structure

### Documentación

```text
specs/003-reservas-pagos-resenas/payments_service/
├── spec.md
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
├── tasks.md
├── checklists/requirements.md
└── contracts/
    ├── openapi-payments-service.yaml
    └── payment-events-v1.schema.json
```

### Código fuente

```text
apps/payments-service/
├── package.json  tsconfig.json  tsconfig.build.json  jest.config.ts  README.md
├── prisma/schema.prisma  prisma/migrations/001_payments_core/migration.sql  # incluye historiales de pago/reembolso y ledger mock local
├── src/
│   ├── main.ts  app.module.ts
│   ├── domain/
│   │   ├── shared/{domain-error.ts,money.ts}
│   │   ├── payments/{payment.entity.ts,payment-status.ts,payment.policy.ts}
│   │   └── refunds/{refund.entity.ts,refund.policy.ts}
│   ├── application/
│   │   ├── ports/{payment.repository.ts,refund.repository.ts,idempotency.repository.ts,
│   │   │          outbox.repository.ts,payment-gateway.port.ts,unit-of-work.ts,clock.port.ts}
│   │   ├── payments/{create-payment.use-case.ts,get-payment-status.use-case.ts,reconcile-pending.use-case.ts}
│   │   ├── refunds/refund-payment.use-case.ts
│   │   ├── events/{payment-events.ts,publish-outbox.use-case.ts}
│   │   └── errors/payments-errors.ts
│   ├── infrastructure/
│   │   ├── config/{payments-config.ts,config.module.ts}
│   │   ├── persistence/prisma/{prisma.service.ts,prisma.module.ts,payment.repository.ts,
│   │   │                      refund.repository.ts,idempotency.repository.ts,outbox.repository.ts,database-error.ts}
│   │   ├── gateway/{mock-payment-gateway.adapter.ts,gateway-circuit-breaker.ts}
│   │   ├── messaging/{rabbitmq.publisher.ts,outbox.relay.ts}
│   │   ├── security/{jwt.verifier.ts,token-fingerprint.ts}
│   │   ├── observability/otel.ts
│   │   └── logging/payments-logger.ts
│   ├── interfaces/
│   │   ├── http/{configure-http.ts,problem.filter.ts,problem.mapper.ts,validation.pipe.ts,trace.interceptor.ts,
│   │   │        auth/jwt.strategy.ts,guards/{service-auth.guard.ts,roles.guard.ts,roles.decorator.ts},
│   │   │        payments/{payments.controller.ts,create-payment.dto.ts},
│   │   │        refunds/{refunds.controller.ts,refund-payment.dto.ts}}
│   │   └── openapi/{openapi.factory.ts,payments.openapi.ts,schemas.ts}
│   └── modules/{payments.module.ts,refunds.module.ts,outbox.module.ts,reconciler.module.ts,health/}
└── test/
    ├── unit/  integration/  contract/  security/  performance/
    └── fixtures/{payments.fixture.ts,jwt.fixture.ts,mock-gateway.fixture.ts}
```

Además, fuera del workspace pero necesarios: `infra/docker/payments/Dockerfile`, servicios `payments-db`, `payments-migrate` y `payments-service` en `docker-compose.yml`, variables en `.env.example` y workspace registrado en `package.json` y `nest-cli.json`. Estos archivos compartidos **solo** se tocan en las tareas marcadas "compartido" y con aprobación del equipo.

## Responsabilidad por capa

- **Domain**: `Money` (unidades menores COP/USD, `number` entero seguro sin overflow), `Payment` y `Refund` con transiciones `REVIEW_REQUIRED`, y `RefundPolicy` (saldo, motivo `OWNER_CANCELLATION` = completo). Sin Nest, Prisma, HTTP ni RabbitMQ.
- **Application**: casos de uso con transacciones **cortas**. `CreatePayment`: idempotencia + `PENDING` → pasarela externa a tx → resultado + historial + evento outbox atómico. `RefundPayment`: bloquear/validar + crear reembolso `PENDING` → cerrar tx → pasarela → aplicar resultado e outbox en otra tx. `ReconcilePending`: reclamar lotes con `SKIP LOCKED`, liberar tx antes de consulta externa y escalar incertidumbre a `REVIEW_REQUIRED`.
- **Infrastructure**: repositorios Prisma (`BIGINT` con validación de rango), adaptador mock de dev/test con ledger durable e idempotente **separado lógicamente** de transacciones del dominio, circuit breaker, relay outbox con confirms, JWT y logger redactado.
- **Interfaces**: DTOs con whitelist estricta, guards, mapeo de errores a Problem Details, OpenAPI.

## Flujos críticos

**Cobro**: validar → registrar idempotencia + pago `PENDING` (tx 1) → llamar pasarela con timeout, fuera de la transacción → aplicar `APPROVED`/`DECLINED` + historial + outbox + respuesta idempotente (tx 2). Si la llamada produce ambigüedad, se persiste `PENDING` con programación de próxima consulta y respuesta idempotente `202` (tx de actualización corta). Si el proceso cae entre las dos transacciones, el reconciliador consulta el ledger mock persistente. Tras agotar consultas sin evidencia queda `REVIEW_REQUIRED` y bloquea un nuevo cargo hasta verificación.

**Reembolso**: tx 1 con `SELECT … FOR UPDATE` → validar saldo/motivo → crear reembolso `PENDING` (índice parcial impide dos pendientes o en revisión) → **cerrar tx** → llamar pasarela → tx 2 con `COMPLETED` (suma saldo/cambia pago/guarda outbox) o `FAILED` definitivo (outbox, saldo intacto). Timeout = `PENDING` y luego quizá `REVIEW_REQUIRED`; nunca repetir ni liberar reserva de saldo sin evidencia.

**Publicación**: desde US1/US3 se graban los eventos en outbox en la tx de cambio de estado; solo en US4 se activa el relay. El relay reclama lotes sin adelantar eventos anteriores del mismo `aggregate_id`, publica con confirmación, marca `PUBLISHED`; en fallo aplica backoff y tras `PAYMENTS_OUTBOX_MAX_ATTEMPTS` marca `DEAD` (esto **no** modifica el estado del pago) y emite métrica.

**Escalamiento seguro**: después del presupuesto de consultas sin evidencia, `Payment` o `Refund` cambia a `REVIEW_REQUIRED`, se guarda historial/evento y sigue prohibida la creación de un cargo/reembolso que pueda duplicar el anterior. No existe endpoint público para forzar una salida; cualquier procedimiento autorizado futuro debe demostrar el resultado en la pasarela y guardar evidencia no sensible en auditoría.

**Mock recuperable**: la operación `charge`/`refund` se registra en `mock_gateway_operations` con referencia HMAC y resultado, en operación de persistencia aislada del commit del dominio. En `tok_gateway_timeout` se registra primero un resultado y luego se simula timeout. Al reiniciar, `getTransaction` consulta ese ledger; si no hay resultado, retorna UNKNOWN, jamás un rechazo por inferencia.

## Seguridad

- Validación JWT de usuario: RS256, `kid`, `iss`, `aud`, `exp`, edad máxima; igual que `verifyJwt` de Users.
- JWT de servicio por ruta con scope exacto; scopes no intercambiables.
- Token de pago: nunca persistido ni registrado; se guarda HMAC con `PAYMENTS_TOKEN_HMAC_SECRET` (≥ 32 caracteres, obligatorio al arrancar).
- Logs: JSON con redacción recursiva de `token`, `authorization`, `idempotency-key`, `paymentMethod`.
- Respuestas: `Cache-Control: no-store` en estado; sin `gatewayReference`.
- Pruebas negativas obligatorias: usuario ajeno (404), usuario con scope equivocado (403), JWT con `alg: none`, `kid` desconocido, audiencia incorrecta, campos extra, token con formato de PAN, cuerpo gigante.

## Observabilidad

Logs JSON con `traceId`; trazas OTLP HTTP/DB/gateway/AMQP; métricas: `payments_created_total{status}`, `payments_gateway_latency_seconds`, `payments_refunds_total{status}`, `payments_idempotent_replays_total`, `payments_pending_age_seconds`, `payments_outbox_pending`, `payments_outbox_dead`, `payments_circuit_state`.

## Configuración (`.env.example`, prefijo `PAYMENTS_`)

`PAYMENTS_PORT=3006`, `PAYMENTS_DATABASE_URL_FILE`, `PAYMENTS_JWT_*` (iguales a `USERS_JWT_*`: issuer, audience, kid, public key), `PAYMENTS_SERVICE_JWT_ISSUER=stayhub-bookings-service`, `PAYMENTS_SERVICE_JWT_AUDIENCE=stayhub-payments-service`, `PAYMENTS_SERVICE_JWT_KID`, `PAYMENTS_SERVICE_JWT_PUBLIC_KEY_FILE`, `PAYMENTS_CHARGE_SCOPE`, `PAYMENTS_REFUND_SCOPE`, `PAYMENTS_READ_SCOPE`, `PAYMENTS_ALLOWED_CURRENCIES=COP,USD`, `PAYMENTS_MAX_AMOUNT_MINOR` (entero seguro <= 9000000000000), `PAYMENTS_GATEWAY_TIMEOUT_MS=5000`, `PAYMENTS_GATEWAY_CIRCUIT_FAILURE_THRESHOLD`, `PAYMENTS_GATEWAY_CIRCUIT_RESET_MS`, `PAYMENTS_IDEMPOTENCY_TTL_HOURS=48`, `PAYMENTS_TOKEN_HMAC_SECRET_FILE`, `PAYMENTS_RABBITMQ_URL_FILE`, `PAYMENTS_RABBITMQ_EXCHANGE=stayhub.payments`, `PAYMENTS_OUTBOX_*`, `PAYMENTS_RECONCILER_*`, `OTEL_SERVICE_NAME=stayhub-payments-service`.

## Docker Compose (tareas compartidas)

`payments-db` (`postgres:16-bookworm`, red `payments-internal`), `payments-migrate` (target `migration`, `restart: 'no'`), `payments-service` (target `runtime`, `restart: always`, health check a `/health/ready` en 3006, `depends_on` migración completada, redes `payments-internal` y `services`). RabbitMQ se declara dependencia **blanda**: el servicio arranca sin él.

## Estrategia de pruebas

| Suite | Cubre |
|---|---|
| unit | `Money`, máquina de estados, política de reembolso, huella de cuerpo canónico, backoff, mock gateway. |
| integration (PostgreSQL 16 real) | índice que incluye `REVIEW_REQUIRED`, `CHECK` de saldo en BIGINT, idempotencia concurrente, reembolsos concurrentes, outbox transaccional, ledger mock persistente y reconciliador con `SKIP LOCKED`. |
| integration (RabbitMQ real) | publisher confirms, caída y recuperación del broker, `DEAD`. |
| contract | OpenAPI y esquema de eventos contra respuestas reales; fixtures para Bookings y Notifications. |
| security | los casos negativos de la sección Seguridad y ausencia de secretos en logs. |
| performance | p95 de estado y cobro con mock. |

## Orden de entrega y corte de MVP

1. **Corte funcional provisional (PAY-001…PAY-052)**: Setup + Fundamentos + Historias 1–3. Entrega cobro, estado y reembolso con idempotencia, seguridad y **eventos grabados en outbox**, pero **sin** relay RabbitMQ ni reconciliación automática completa; no llamar a este corte entregable operativo cerrado.
2. **Siguiente**: Historia 4 (relay RabbitMQ y pruebas de entrega), que completa la publicación de eventos ya grabados por US1/US3.
3. **Después**: Historia 5 (reconciliador) y la fase transversal (rendimiento, evidencia).

Si el tiempo no alcanza, declarar US5 pendiente y **no afirmar que pagos/reembolsos ambiguos se resolverán automáticamente**. El estado PENDING y los bloqueos siguen activos hasta evidencia o implementación del reconciliador.

## Riesgos

| Riesgo | Mitigación |
|---|---|
| Doble cobro por reintentos o concurrencia | Idempotencia, índice parcial, pruebas concurrentes con PostgreSQL real. |
| Estado desconocido tras timeout | `PENDING` + reconciliador; nunca asumir rechazo. |
| Pérdida de eventos | Outbox transaccional con confirmaciones y estado `DEAD` visible. |
| Contrato con Bookings cambia | Contratos versionados en `contracts/` y fixtures de consumidor. |
| Consulta de pago desde web | Endpoint de estado solo en red interna; no prometer acceso del huésped hasta integrar una ruta pública autorizada en Gateway/Bookings. |
| Mock no recupera tras reinicio | Ledger durable de pruebas separado lógicamente de Payments; escenario real de caída/reinicio en integración. |
| Desalineación CI/workspaces | PAY-002 hace cambios raíz tras aprobación; PAY-065 agrega `payments-quality` a GitHub Actions en tarea compartida tras acordar con el equipo. |
| Prisma e índices parciales | SQL manual de migración verificado en integración desde cero. |
| Fuga de datos de pago en logs | Redacción recursiva y prueba de seguridad dedicada. |
| Tiempo limitado hasta el 28 nov | Corte MVP explícito y tareas pequeñas con commit propio. |

## Complexity Tracking

Sin violaciones constitucionales. El outbox y el reconciliador añaden piezas, pero se justifican por los principios IV (sin pérdida silenciosa) y por el RNF de disponibilidad de un servicio crítico.
