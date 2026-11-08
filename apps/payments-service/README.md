# Payments Service

`@stayhub/payments-service` procesa cobros y reembolsos contra una pasarela simulada, conserva el estado de cada operación y expone consultas internas de pagos. No calcula el total de la reserva ni decide políticas de cancelación; recibe esas decisiones del servicio llamador.

> El servicio se está implementando siguiendo PAY-001…PAY-070. Los comandos de build, inicio, Prisma y pruebas quedan disponibles a medida que se completen las tareas que crean su código, esquema y entorno.

## Configuración local

Usa Node.js 20 desde la raíz del monorepo. Configura las variables `PAYMENTS_*` de [`.env.example`](../../.env.example) y crea los archivos de secretos fuera de Git. Las URL de base de datos y RabbitMQ, la clave pública JWT y el secreto HMAC se inyectan mediante rutas `*_FILE`; no guardes credenciales ni llaves reales en este repositorio.

Variables principales:

- `PAYMENTS_PORT` y `PAYMENTS_DATABASE_URL_FILE`.
- `PAYMENTS_JWT_*` para validar tokens de usuario y `PAYMENTS_SERVICE_JWT_*` para llamadas de servicio.
- `PAYMENTS_CHARGE_SCOPE`, `PAYMENTS_REFUND_SCOPE` y `PAYMENTS_READ_SCOPE`.
- `PAYMENTS_ALLOWED_CURRENCIES`, `PAYMENTS_MAX_AMOUNT_MINOR` y controles `PAYMENTS_GATEWAY_*`.
- `PAYMENTS_TOKEN_HMAC_SECRET_FILE`, `PAYMENTS_RABBITMQ_*`, `PAYMENTS_OUTBOX_*` y `PAYMENTS_RECONCILER_*`.

## Comandos

Desde la raíz del monorepo, una vez completadas las tareas de setup correspondientes:

```powershell
npm ci
npm run prisma:payments:generate
npm run prisma:payments:migrate:dev
npm run build:payments
npm run start:dev --workspace @stayhub/payments-service
```

Calidad:

```powershell
npm run lint:payments
npm run typecheck:payments
npm run test:payments:unit
npm run test:payments:integration
npm run test:payments:contract
npm run test:payments:security
npm run test:payments:performance
npm run test:payments:coverage
```

Las suites de integración requieren PostgreSQL 16 y RabbitMQ desechables. No se consideran aprobadas si su infraestructura no está disponible. Consulta el [quickstart](../../specs/003-reservas-pagos-resenas/payments_service/quickstart.md) antes de ejecutar los escenarios completos.

## Tokens de la pasarela mock

Los siguientes valores son fixtures sintéticos de desarrollo y pruebas; no son credenciales de una pasarela real:

| Token | Resultado esperado |
|---|---|
| `tok_approved` | Cobro aprobado. |
| `tok_declined_funds` | Rechazo definitivo por fondos insuficientes. |
| `tok_declined_fraud` | Rechazo definitivo por sospecha de fraude. |
| `tok_gateway_timeout` | Resultado incierto; el pago queda `PENDING` y se reconcilia. |
| `tok_gateway_down` | Fallo confirmado antes del despacho; no se registra un cobro. |
| `tok_refund_fails` | Reembolso fallido solo ante rechazo definitivo; el saldo permanece intacto. |

## Contratos y diseño

- [Especificación funcional](../../specs/003-reservas-pagos-resenas/payments_service/spec.md)
- [Plan técnico](../../specs/003-reservas-pagos-resenas/payments_service/plan.md)
- [Quickstart y escenarios](../../specs/003-reservas-pagos-resenas/payments_service/quickstart.md)
- [Contrato OpenAPI](../../specs/003-reservas-pagos-resenas/payments_service/contracts/openapi-payments-service.yaml)
- [Esquema de eventos](../../specs/003-reservas-pagos-resenas/payments_service/contracts/payment-events-v1.schema.json)

## Seguridad y límites

Payments solo recibe tokens opacos de tarjeta. No acepta ni almacena PAN, CVV ni datos de vencimiento. Los pagos y reembolsos con resultado incierto permanecen bloqueados hasta que exista evidencia definitiva; no se deben repetir cargos a ciegas. La integración real con otros microservicios se gestiona fuera de este servicio.
