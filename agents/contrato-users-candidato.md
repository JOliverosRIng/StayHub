# Contrato candidato Auth ↔ Users (propuesta para G2)

Estado: **IMPLEMENTADO Y VERIFICADO TÉCNICAMENTE** (integración Auth↔Users, 2026-09-30). La
**revisión humana/contractual de G2 y G1 sigue PENDIENTE**: no se ha registrado ninguna aprobación.
Ver §9. Dueño de la decisión: **G2 (users-service)**. Este documento no es un
contrato vigente: describe la propuesta mínima que Auth necesita para avanzar localmente. La
aceptación real se registra en AUTH-076 (registro) y AUTH-078 (expectativas del Gateway). Auth no
edita `openapi-users-service.yaml` ni implementa endpoints en Users-Service.

Tareas afectadas: PRE-004 (este documento), AUTH-040, AUTH-041, AUTH-076, AUTH-079.

## 1. Endpoint faltante: GET de registro por `registrationId`

`openapi-users-service.yaml` ya define POST create, POST activate, POST cancel y POST resolve, pero
no permite releer un registro existente. El puerto de Auth exige `getRegistration` (hallazgo H01).

Propuesta:

```yaml
/internal/v1/registrations/{registrationId}:
  get:
    operationId: getRegistration
    security: [{ serviceAuth: [] }]
    parameters:
      - name: registrationId
        in: path
        required: true
        schema: { type: string, format: uuid }
    responses:
      '200':
        description: Current summary for the registration.
        content:
          application/json:
            schema: { $ref: '#/components/schemas/UserSummary' }
      '401': { $ref: '#/components/responses/Problem' }
      '403': { $ref: '#/components/responses/Problem' }
      '404': { $ref: '#/components/responses/Problem' }
      '503': { $ref: '#/components/responses/Problem' }
```

- Autenticación: **service JWT** (Bearer), igual que el resto de rutas `/internal/v1`.
- `registrationId`: UUID de la operación de registro de Auth.
- `200`: `UserSummary` existente, sin añadir campos.
- `404`: registro ausente; distinto de un timeout (D03).
- `401/403`: autenticación de servicio inválida o no autorizada.
- `503`: dependencia no disponible.

## 2. `UserSummary` y mapping `id` → `userId`

`UserSummary` (Users) usa `id`; el puerto de Auth usa `userId` (hallazgo H02). El adapter de Auth
mapea explícitamente:

| Users (`UserSummary`) | Auth (`RegistrationIdentity`) |
|---|---|
| `id` | `userId` |
| `name` | `name` |
| `email` | `email` |
| `role` | `role` |
| `status` | `status` |

`RegistrationIdentity` = `{ userId, name, email, role, status }`. `name`/`email` se conservan
**solo en memoria** para construir la respuesta pública del registro; no se persisten ni se copian a
`auth_db`. `LoginIdentity` sigue siendo el mínimo `{ userId, role, status: 'ACTIVE' }` y no incluye
datos de perfil.

El adapter debe verificar la coincidencia con el `userId` esperado y el formato/estado antes de
avanzar (D07). El stub local implementa esta propuesta y está rotulado "contrato candidato": su
éxito **no** acredita integración real con Users.

## 3. Errores públicos de registro (Auth)

- `REGISTRATION_CONFLICT` → HTTP 409: misma `Idempotency-Key` con fingerprint distinto, o correo ya
  existente confirmado por Users.
- `REGISTRATION_CANCELLED` → HTTP 409: reintento sobre un registro cancelado; requiere una nueva
  `Idempotency-Key`.
- `IDEMPOTENCY_CONFLICT` se mantiene.
- Los conflictos remotos se traducen a estos códigos con `detail` seguro; nunca propagan texto,
  cuerpos ni códigos internos de Users.

## 4. Excepciones explícitas de datos

- Registro: `name` y `email` **sí** forman parte de la respuesta pública (`UserSummary`). No es una
  fuga de secretos.
- Login/refresh exitosos: `accessToken` y `refreshToken` forman parte deliberada de la respuesta.
- El resto de respuestas y logs no incluyen credenciales, bearer, cookies ni tokens.

## 5. Normalización previa

- `name`: `trim`.
- `email`: `trim` + `lowercase` **antes** de validar formato y de calcular el fingerprint de
  idempotencia.
- `password`: se evalúa exactamente como llega (sin trim, case folding ni normalización Unicode);
  longitud contada por puntos de código Unicode (8–128).

Resolver la normalización antes de la validación y del fingerprint corrige parte del hallazgo H10;
el ajuste de DTO se ejecuta en AUTH-026/044/049/071/073, no aquí.

## 6. Introspección sin `exp`: sin caché positiva

El contrato interno `POST /internal/v1/sessions/validate` recibe `{ sessionId, userId }` y **no**
transporta la expiración del access token. Por tanto, ese camino no cachea resultados positivos:
consulta PostgreSQL siempre. La caché con TTL acotado queda para callers locales con JWT verificado
(AUTH-068), según D06.

## 7. Gateway: puerto y variable de configuración

`openapi-public.yaml` publica `https://localhost:8443/api/v1`; el plan mencionaba 8080 y no hay
acuerdo G1 registrado (H19). Hasta que G1 lo confirme, Auth referencia el destino del Gateway con la
variable `GATEWAY_BASE_URL` (configurable). No se edita el contrato público unilateralmente. La
validación HTTP de la integración queda para AUTH-081.

## 8. Cómo se cierra

- Local: Auth implementa contra el stub candidato (AUTH-041) y los tipos de aplicación
  (`auth-use-cases.port.ts`).
- Externo: AUTH-076 valida el contrato real de registro y el GET propuesto; AUTH-078 valida las
  expectativas del Gateway. La aprobación de G2/G1 actualiza este documento y el OpenAPI de Users en
  una coordinación aparte.

## 9. Implementación y evidencia técnica (2026-09-30)

Esta sección registra hechos verificados. No sustituye la aceptación de G2/G1.

- El GET §1 está implementado en Users (`GetRegistration`, `RegistrationController`
  `@Get(':registrationId')`) y publicado en `openapi-users-service.yaml`
  (`operationId: getRegistration`). `node scripts/validate-users-openapi.mjs` confirma que coincide
  con el Swagger generado, sin drift.
- Contrato real: service JWT RS256 (`kid`/`iss`/`aud` del par Auth→Users) con scope
  `users:registration`. Responde `200 UserSummary {id, name, email, role, status}` con el estado
  actual (PENDING/ACTIVE/CANCELLED); 400 para un UUID inválido, 401 si el JWT falta o no es válido,
  403 si el scope es insuficiente, 404 si el registro no existe y 503 si la base no está
  disponible. Es solo lectura.
- §1 frente a la implementación: la implementación añade `400` para un UUID mal formado. El resto
  coincide.
- §2: el mapping `id → userId` se verificó con Users real. Además, el lookup devuelve exactamente
  `{userId, role, status: ACTIVE}`.
- Auth usa Users real (no el stub) en registro, login, reconciliación y en los dos comandos de
  desarrollo. Los dobles de Users se conservan solo en pruebas aisladas de Auth.
- El 404 del GET distingue la ausencia de un fallo (D03). El reconciliador de Auth solo cierra una
  compensación como `CANCELLED` ante ese 404 autenticado.
- Evidencia: `npm run test:auth-users` (9 suites, 38 tests, INT-01–17), la suite de contrato de
  Users (`test/contract/registration.contract.spec.ts`) y `agents/integracion/resultado.md`.
- Pendiente: la aprobación de G2 (AUTH-076 como revisión contractual) y las expectativas de Gateway
  (AUTH-078/081), que requieren Gateway.
