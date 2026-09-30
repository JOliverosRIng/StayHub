# AUTH-067 — Resultado de ejecución

Fecha: 2026-09-29. Base revisada: commit `393a80d`, rama `Auth_Service`. Estado: **Implementado local (GREEN)**.

Dependencias leídas: AUTH-055 (prueba preparada) y AUTH-066 (implementado local). Reglas aplicadas: D01, D02,
D04–D06, D08–D10.

## Objetivo

Implementar la rotación productiva del refresh (D04): hash del raw para localizar la sesión, decisión
autoritativa dentro del `SessionUnitOfWork` con locks `sesión → token`, sucesor único, detección de replay
con revocación de familia confirmada antes del 401, e invalidación de caché best-effort. Sustituye la
referencia test-local de AUTH-055.

## Cambios realizados

| Archivo | Cambio | Motivo |
|---|---|---|
| `src/application/sessions/rotate-refresh-token.use-case.ts` | **Nuevo.** `RotateRefreshTokenService implements RotateRefreshTokenUseCase`: lookup por hash, `UoW` con `lockSession`→`lockRefresh`→estado, replay (`REFRESH_REUSE` + `revokeActiveForSession`) o rotación (`markConsumed`→`insertSuccessor`→`linkSuccessor`→`incrementVersion`→`saveSession`); firma antes del commit; invalida caché y lanza 401 solo fuera del UoW. | No existía el caso de uso productivo. |
| `src/domain/sessions/session.ts` | Nuevo `incrementVersion()` (sube `version` sin tocar rol ni expiración). | Evitar rehidratar la sesión a mano al rotar. |
| `test/unit/rotate-refresh-token.use-case.spec.ts` | **Nuevo.** 9 pruebas con dobles: desconocido, éxito/orden, `REVOKED`, vencido, sesión revocada, replay+commit, caché caída, error técnico y fallo de firma. | Distingue validación, commit de replay y error técnico. |
| `test/integration/refresh-rotation.spec.ts` | Migrada a `RotateRefreshTokenService` + `HmacRefreshTokenCodec` + `IssueSessionTokensService` productivos; 11 pruebas con PostgreSQL real, dos conexiones y caché espía; añade inyección de fallo tras `insertSuccessor`. | Reejecutar AUTH-055 contra producción. |
| `test/helpers/reference-refresh-rotation.ts` | Se eliminan `ReferenceRotateRefreshTokenService` y `createHmacRefreshTokenCodec`; queda `StubAccessTokenSigner`. | Cumplir el handoff de AUTH-055. |

`session-unit-of-work.port.ts` no requirió cambios: ya exponía `lockSession`, `lockRefresh`, `markConsumed`,
`insertSuccessor`, `linkSuccessor`, `revokeActiveForSession` y `saveSession`.

## Comportamiento verificado

- **Rotación.** El raw solo se usa para derivar el HMAC; el token viejo queda `CONSUMED` con `consumedAt`,
  enlaza a un único sucesor `ACTIVE` con `expiresAt = login+7d`, y la sesión sube `version` sin cambiar rol
  ni expiración. Solo se persiste el HMAC (64 hex), nunca el raw.
- **Inválidos.** Token desconocido, `REVOKED`, vencido o de sesión revocada → `RefreshTokenInvalidError` (401)
  sin sucesor ni escrituras.
- **Replay.** Un token `CONSUMED` revoca la sesión con `REFRESH_REUSE` y todos sus refresh `ACTIVE`; la
  transacción **commitea** y solo después se invalida la caché y se lanza el 401. Otra sesión del mismo
  usuario queda intacta.
- **Caché best-effort.** Si `deleteSession` falla, la revocación en PostgreSQL se mantiene y el 401 se
  devuelve igual.
- **Rollback.** Fallo de firma o fallo posterior al `insertSuccessor` revierten todo (token original `ACTIVE`,
  `version` 1, sin sucesor).
- **Concurrencia.** De dos rotaciones simultáneas del mismo raw (dos conexiones), exactamente una rota y la
  otra detecta replay; la sesión queda revocada y con 0 `ACTIVE` (2 tokens en total).

## Evidencia de comandos

```sh
npm run typecheck   # OK
npm run lint        # OK
npm run build       # OK
npm run test:unit   # 15 suites, 123 tests (rotate-refresh-token 9/9)
npm run test:security   # 2 suites, 46 tests
npm run test:contract   # 133 pasan + 1 RED esperado (trim de email, AUTH-071)

TEST_AUTH_DATABASE_URL="postgresql://stayhub_auth_test:test_password@127.0.0.1:55432/auth_test" \
TEST_AUTH_REDIS_URL="redis://:test_redis_password@127.0.0.1:56379/15" \
AUTH_TEST_ALLOW_CLEANUP=true \
npm run test --workspace @stayhub/auth-service -- --selectProjects integration \
  --runTestsByPath test/integration/refresh-rotation.spec.ts   # 11/11

# Proyecto de integración completo: 10 suites, 94 tests, 0 fallos
```

## Criterios de aceptación

- [x] Una rotación produce un sucesor y conserva `role`/`userId`/`expiry`.
- [x] El replay revoca efectivamente incluso cuando la respuesta es 401.
- [x] La concurrencia satisface el resultado descrito en D04 (una rota, otra replay, familia revocada).

## Pendiente / handoff

- **AUTH-068:** introspección autoritativa; la caché se invalida aquí al revocar por replay.
- **AUTH-071/072:** exponer el caso de uso en `SessionsController` y registrarlo (`ROTATE_REFRESH_TOKEN_USE_CASE`).
- **AUTH-074:** cierre de la historia de autenticación reejecutando la matriz.
- Sin bloqueos de infraestructura.
