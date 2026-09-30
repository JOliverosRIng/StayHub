# AUTH-050 — Resultado de ejecución

Fecha: 2026-09-28. Base revisada: commit `393a80d`, rama `Auth_Service`. Estado: **Prueba preparada (GREEN contra fixture; ruta productiva ausente)**.

Dependencias leídas: PRE-001, PRE-004 (ambas verificadas localmente). Reglas aplicadas: D01, D02, D04–D06, D08–D10.

## Objetivo

Preparar la suite de contrato HTTP de refresh (`POST /internal/v1/sessions/refresh`) antes de que exista
`SessionsController` (AUTH-071), con evidencia GREEN contra un fixture test-local y la ausencia de ruta
productiva registrada como RED.

## Cambios realizados

| Archivo | Cambio | Motivo |
|---|---|---|
| `apps/auth-service/test/contract/refresh.contract.spec.ts` | **Nuevo**. Suite de contrato con `RefreshFixtureController` test-local, doble tipado de `ROTATE_REFRESH_TOKEN_USE_CASE`, `ServiceAuthGuard`/pipe/filtro reales, `ServiceJwtVerifier` real y claves RSA efímeras. | No existe aún el controlador productivo; el fixture sostiene la matriz y se sustituye por `SessionsController` en AUTH-071. |

No se modificó código productivo ni `auth-app.ts`. El fixture vive solo en `test/`.

## Cobertura de la matriz

- **Ruta ausente (RED documentado):** contra la composición de producción (sin el fixture) `POST` devuelve 404.
- **Happy path:** 200 con `InternalTokenPair` completo (tokens rotados, `expiresIn === 3600` entero,
  `absoluteExpiresAt` ISO y `principal` con UUIDs); sin `Set-Cookie`; el body válido funciona sin cookie;
  `execute` recibe `{ refreshToken, traceId }`.
- **400 (6 casos + cookie-only) antes del caso de uso:** `refreshToken` ausente/`null`/numérico/`< 32`;
  campo desconocido; campo `role`; petición solo con cookie (el contrato interno usa el body). No invoca negocio.
- **401 genérico:** token desconocido, vencido, consumido o revocado → `REFRESH_TOKEN_INVALID`; `traceId`
  coherente con `x-trace-id`; el `problem` no contiene el raw token. Se distingue 400 de forma de 401 de token
  sintácticamente válido.
- **503:** fallo de persistencia → `DEPENDENCY_UNAVAILABLE` sin exponer el raw token.
- **401 service JWT (7 casos):** sin bearer; firma con clave foránea; issuer/audience/scope incorrectos;
  token vencido; el rechazo no invoca el caso de uso.

## Evidencia de comandos

Ejecutado desde la raíz del monorepo:

```sh
npm run typecheck   # OK
npm run lint        # OK
npm run test --workspace @stayhub/auth-service -- --selectProjects contract \
  --runTestsByPath test/contract/refresh.contract.spec.ts
```

Resultado de la suite: **1 suite, 22 tests: 22 pasan**. La única conducta aún ausente es la ruta productiva,
documentada por el caso 404.

## Criterios de aceptación

- [x] No se implementa cookie en Auth ni se acepta otro campo de identidad (el cookie-only da 400).
- [x] Errores y respuesta exitosa coinciden con el OpenAPI actualizado (400 pendiente en AUTH-073).

## Pendiente / handoff

- **AUTH-071:** reemplazar `RefreshFixtureController` por `SessionsController`, sustituir el 404 por la ruta real.
- **AUTH-055:** probar sobre PostgreSQL real que un replay devuelve 401 **y** el estado revocado permanece;
  esta suite solo cubre el contrato HTTP.
- **AUTH-067:** implementar la rotación/replay que el fixture simula (`RefreshTokenInvalidError`).
- **AUTH-073:** documentar el 400 observable y materializar `minLength: 32` del refresh en el contrato.
- Sin bloqueos de infraestructura: la suite es de contrato y no requiere PostgreSQL/Redis.
