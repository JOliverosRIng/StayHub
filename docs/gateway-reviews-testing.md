# Prueba de comunicación API Gateway ↔ Reviews

## Qué quedó conectado

- `POST /api/v1/reviews` reenvía el bearer validado del huésped a Reviews.
- `GET /api/v1/properties/:propertyId/reviews` es pública en el Gateway y usa un JWT interno
  con audience `stayhub-reviews-service` y scope `reviews:read` hacia Reviews.
- `GET /api/v1/reviews/user/:userId` exige sesión y valida ownership antes de contactar Reviews.
- Las tres rutas propagan correlación como `x-request-id` y los errores remotos se normalizan a
  Problem Details.

## 1. Validación rápida sin contenedores

Desde la raíz del repositorio:

```powershell
npm run typecheck:gateway
npm run lint:gateway
npm run build:gateway
npm run test:gateway:integration -- test/integration/gateway-reviews.spec.ts
npm run test:gateway:integration -- test/integration/gateway-reviews-routing.spec.ts
npm run test:gateway:reviews:e2e
docker compose --env-file .env.example config --quiet
```

La primera integración valida el cliente REST y sus credenciales. La segunda inicia el Gateway
real por HTTPS y prueba las tres rutas públicas contra dobles contractuales de Auth y Reviews.
El E2E adicional inicia Gateway y Reviews reales, aplica la migración sobre un PostgreSQL 16
temporal en Docker y usa dobles únicamente para las dependencias externas Auth y Bookings. El
contenedor PostgreSQL se elimina automáticamente incluso si la prueba falla.

## 2. Alineación obligatoria del entorno real

Antes de levantar contenedores, comprobar en `.env`:

```text
GATEWAY_REVIEWS_BASE_URL=http://reviews-service:3007
GATEWAY_SERVICE_ISSUER=stayhub-api-gateway
REVIEWS_GATEWAY_JWT_ISSUER=stayhub-api-gateway
GATEWAY_REVIEWS_SERVICE_AUDIENCE=stayhub-reviews-service
REVIEWS_GATEWAY_JWT_AUDIENCE=stayhub-reviews-service
GATEWAY_REVIEWS_SERVICE_SCOPE=reviews:read
REVIEWS_GATEWAY_JWT_SCOPE=reviews:read
```

`REVIEWS_GATEWAY_JWT_PUBLIC_KEYS_JSON` debe contener la clave pública correspondiente a
`GATEWAY_SERVICE_PRIVATE_KEY_SOURCE`, bajo el mismo `kid` de `GATEWAY_SERVICE_KID`. Asimismo,
`GATEWAY_JWT_PUBLIC_KEYS_JSON` debe contener la clave pública con la que Auth firma los access JWT.
No se deben copiar claves privadas dentro de variables `*_PUBLIC_KEYS_JSON`.

## 3. Arranque y comprobación real

1. Iniciar Docker Desktop.
2. Validar la composición:

   ```powershell
   docker compose --env-file .env config --quiet
   ```

3. Levantar el Gateway y sus dependencias declaradas:

   ```powershell
   docker compose --env-file .env up -d --build api-gateway
   docker compose ps
   ```

4. Comprobar salud del Gateway:

   ```powershell
   curl.exe -k https://localhost:8080/health/live
   ```

5. Probar la consulta pública con cualquier UUID válido. Una base sin reseñas debe responder
   `200` con `items: []`, no `401`:

   ```powershell
   curl.exe -k "https://localhost:8080/api/v1/properties/33333333-3333-4333-8333-333333333333/reviews?page=1&pageSize=20"
   ```

6. Para creación e historial, iniciar sesión y usar el access token de un usuario `GUEST`.
   La creación requiere además un `bookingId` real, perteneciente al huésped y con estado
   `COMPLETED` en Bookings:

   ```powershell
   curl.exe -k -X POST https://localhost:8080/api/v1/reviews `
     -H "Authorization: Bearer ACCESS_TOKEN" `
     -H "Content-Type: application/json" `
     -d '{"bookingId":"BOOKING_UUID","rating":5,"comment":"Excelente estadía"}'

   curl.exe -k "https://localhost:8080/api/v1/reviews/user/USER_UUID?page=1&pageSize=20" `
     -H "Authorization: Bearer ACCESS_TOKEN"
   ```

7. Si hay un error, revisar ambos extremos con correlación:

   ```powershell
   docker compose logs --tail=150 api-gateway reviews-service
   ```

## Resultado esperado

- Consulta pública: `200` y página cerrada sin `guestId` ni `bookingId`.
- Creación válida: `201`.
- Historial propio: `200`.
- Historial de otro usuario: `403` antes de contactar Reviews.
- Bearer ausente/inválido en rutas privadas: `401`.
- Reviews o Auth indisponible: `503` Problem Details.

La prueba real de creación también depende de Bookings y de una reserva completada. Una respuesta
`404`/`409` de negocio no significa que el routing esté roto; debe interpretarse junto con el campo
`code` del Problem Details.
