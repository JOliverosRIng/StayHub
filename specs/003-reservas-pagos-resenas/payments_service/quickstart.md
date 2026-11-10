# Quickstart: Payments Service de StayHub

Guía para levantar y probar `payments-service` localmente. Los comandos asumen PowerShell en la raíz del monorepo (`StayHub/`), Node.js 20 y Docker. **Solo aplica tras implementar PAY-001…PAY-030 y aprobar los cambios compartidos**; no son comandos utilizables con el ZIP de especificaciones por sí solo.

## 1. Instalar y compilar

```powershell
npm install
npm run build:payments
npm run typecheck:payments
```

## 2. Levantar la base de datos y la migración

```powershell
docker compose up -d payments-db
docker compose run --rm payments-migrate
```

## 3. Variables y secretos de desarrollo

Copia las variables `PAYMENTS_*` de `.env.example` y genera los secretos locales (no se versionan):

```powershell
# Crear la carpeta de secretos local si no existe (no versionarla)
New-Item -ItemType Directory -Force .\secrets | Out-Null
# Secreto criptográficamente aleatorio, 48 bytes en Base64
$bytes = New-Object byte[] 48
$rng = [Security.Cryptography.RandomNumberGenerator]::Create()
try { $rng.GetBytes($bytes) } finally { $rng.Dispose() }
[Convert]::ToBase64String($bytes) | Set-Content -Encoding ascii .\secrets\payments-token-hmac.txt
```

Las claves públicas JWT deben coincidir con las de Auth (access) y con las del servicio llamador (Bookings). Para pruebas locales usa el generador de `test/fixtures/jwt.fixture.ts`.

## 4. Arrancar el servicio

```powershell
npm run start:dev --workspace @stayhub/payments-service
```

Comprobaciones:

```powershell
curl.exe http://localhost:3006/health/live
curl.exe http://localhost:3006/health/ready
```

`ready` debe responder `200` aunque RabbitMQ esté apagado (`rabbitmq: degraded`). No afirmar que los eventos se entregan si el relay de US4 aún no se implementó.

## 5. Flujo manual: cobrar, consultar, reembolsar

Genera un JWT de servicio con scopes `payments:charge payments:refund payments:read` (ver fixture) y guárdalo en `$env:SERVICE_JWT` (variable de entorno de PowerShell).

**Cobrar** (PowerShell, compatible con Windows PowerShell y PowerShell 7)

```powershell
$key = [guid]::NewGuid().ToString()
$headers = @{
  Authorization = "Bearer $env:SERVICE_JWT"
  'Idempotency-Key' = $key
}
$body = @{
  bookingId = '11111111-1111-4111-8111-111111111111'
  payerUserId = '22222222-2222-4222-8222-222222222222'
  amountMinor = 35000000
  currency = 'COP'
  paymentMethod = @{ type = 'CARD_TOKEN'; token = 'tok_approved' }
} | ConvertTo-Json -Depth 5 -Compress

$payment = Invoke-RestMethod -Uri 'http://localhost:3006/payments' `
  -Method Post -Headers $headers -ContentType 'application/json' -Body $body
$payment
$paymentId = $payment.id
```

Esperado: `201` con `status: APPROVED`. Repite exactamente el mismo `Invoke-RestMethod` con **las mismas** variables `$headers` y `$body`: debe responder igual con `Idempotent-Replay: true` y **sin** crear otro pago. Para observar cabeceras HTTP utiliza `Invoke-WebRequest` (sin alterar el cuerpo/clave).

**Montos:** COP usa dos decimales ISO 4217: `35000000` unidades menores son 350.000 COP; `10000000` son 100.000 COP. **Resultados alternativos** (cambia el token y genera otra clave/bookingId): `tok_declined_funds` → `201` `DECLINED/INSUFFICIENT_FUNDS`; `tok_declined_fraud` → `DECLINED/SUSPECTED_FRAUD`; `tok_gateway_timeout` → `202` `PENDING`; `tok_gateway_down` → `503` (fallo confirmado antes de despacho).

**Consultar estado**

Esta ruta es **interna**; no está publicada al huésped en API Gateway. El cliente web no la puede invocar directamente en este incremento.

```powershell
Invoke-RestMethod -Uri "http://localhost:3006/payments/$paymentId/status" `
  -Headers @{ Authorization = "Bearer $env:SERVICE_JWT" }
```

**Reembolso parcial y total**

```powershell
$refundHeaders = @{
  Authorization = "Bearer $env:SERVICE_JWT"
  'Idempotency-Key' = [guid]::NewGuid().ToString()
}
$refundBody = @{ amountMinor = 10000000; reason = 'GUEST_CANCELLATION' } |
  ConvertTo-Json -Compress
Invoke-RestMethod -Uri "http://localhost:3006/payments/$paymentId/refund" `
  -Method Post -Headers $refundHeaders -ContentType 'application/json' -Body $refundBody
```

Esperado: `201`, reembolso `COMPLETED`, pago `PARTIALLY_REFUNDED`. Un segundo reembolso con **nueva** `Idempotency-Key` y cuerpo `@{reason='OWNER_CANCELLATION'}` (monto omitido) reembolsa el saldo restante y deja el pago en `REFUNDED`.

## 6. Escenarios de verificación

| Escenario | Resultado esperado |
|---|---|
| Mismo `Idempotency-Key` y mismo cuerpo | Misma respuesta, `Idempotent-Replay: true`, una sola fila de pago. |
| Mismo `Idempotency-Key`, cuerpo distinto | `409 IDEMPOTENCY_CONFLICT`. |
| Segundo cobro para el mismo `bookingId` con el primero `APPROVED` | `409 STATE_CONFLICT`. |
| Reembolso mayor al saldo | `422 REFUND_AMOUNT_INVALID`. |
| `OWNER_CANCELLATION` con monto parcial | `422`. |
| Reembolso con `tok_refund_fails` | Reembolso `FAILED` **solo con rechazo definitivo de la pasarela**, saldo sin cambios. |
| Consulta de estado con JWT de otro usuario | `404`. |
| JWT de usuario llamando a `POST /payments` | `403`. |
| Cuerpo con campo extra o token con forma de tarjeta | `400`. |
| Timeout con operación sí registrada por el mock | `202 PENDING`; `getTransaction` posterior encuentra resultado tras reiniciar; nunca segundo cobro. |
| Consultas al mock sin evidencia hasta agotar presupuesto | `REVIEW_REQUIRED` y evento de revisión; un segundo cobro/reembolso permanece bloqueado. |
| Reintento por expiración nominal de la clave mientras está pendiente | Bloqueado; idempotencia/índice siguen protegiendo dinero incierto. |

## 7. Eventos

Tras completar US4, con RabbitMQ levantado (`docker compose up -d rabbitmq`), cada cobro o reembolso confirmado publica en el exchange `stayhub.payments`. Para inspeccionar, crea una cola temporal enlazada a `payment.#` en la consola de administración (`http://localhost:15672`). Apaga RabbitMQ, genera pagos y vuelve a encenderlo: los eventos acumulados en `outbox_events` deben publicarse.

## 8. Pruebas

```powershell
npm run test:payments:unit
npm run test:payments:integration   # requiere Docker (PostgreSQL 16 y RabbitMQ desechables)
npm run test:payments:contract
npm run test:payments:security
npm run test:payments:coverage      # gate >= 70 %
```

Las suites `integration` requieren PostgreSQL 16 real y las de relay RabbitMQ real; si la infraestructura no está disponible, la suite se declara **no ejecutada**, nunca exitosa mediante mocks. El bloque RED de una historia puede fallar intencionalmente en una rama local hasta completar los commits GREEN, pero no se debe publicar el PR con CI en rojo.

## 9. Docker Compose completo

```powershell
docker compose up --build payments-db payments-migrate payments-service
docker compose ps
docker kill stayhub-payments-service-1   # debe reiniciarse solo (restart: always)
```
