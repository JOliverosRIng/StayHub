# AUTH-065 — Resultado de ejecución

Fecha: 2026-09-29. Base revisada: commit `393a80d`, rama `Auth_Service`. Estado: **Implementado local (GREEN)**.

Dependencias leídas: AUTH-052, AUTH-063, AUTH-064 y AUTH-066 (todas implementadas/verificadas localmente).
Reglas aplicadas: D01, D02, D04–D06, D08–D10.

## Objetivo

Implementar el `LoginUseCase` productivo (D05): normalizar el correo, aplicar rate limit, resolver la
identidad en Users, verificar una credencial ACTIVE (o hash señuelo), y en éxito emitir los tokens con
AUTH-066 y persistir `Session` + primer `RefreshToken` en una única transacción, limpiando el contador antes
del commit. Reemplaza la referencia test-local de AUTH-052.

## Cambios realizados

| Archivo | Cambio | Motivo |
|---|---|---|
| `src/application/login/login.use-case.ts` | **Nuevo.** `LoginService implements LoginUseCase`: puertos `LoginIdentityResolver`/`CredentialRepository`/`PasswordHasher`/`LoginRateLimiter`/`SessionUnitOfWork`/`SessionTokensIssuer`; normaliza email, `inspect` → Users → credencial → `verifyWithEquivalentCost(hash\|null)`, `InvalidCredentialsError` + `recordFailure` en negativo, y éxito con `issueNewSession` + UoW (`clear` → `saveSession` → `insertSuccessor`). | No existía flujo productivo de login. |
| `test/helpers/reference-login.ts` | Se elimina `ReferenceLoginService`; `FakeSessionTokensIssuer` implementa el `SessionTokensIssuer` productivo (`issueNewSession(userId, role)` + `issueForSession`); se conservan los dobles. | Cumplir el handoff de AUTH-052 (eliminar la referencia). |
| `test/unit/login.use-case.spec.ts` | Migrada a `LoginService` (sin `clock`); la expectativa pasa a `issueNewSession(userId, role)`. | La matriz ahora ejercita la clase productiva. |
| `test/integration/login-rate-limit.spec.ts` | Migrada a `LoginService` como orquestador (limiter/adapter productivos de AUTH-064). | Reejecutar AUTH-056 con el login productivo. |
| `test/integration/login-persistence.spec.ts` | **Nuevo.** 7 pruebas con PostgreSQL 16/Redis 7 reales, `UsersStub` HTTP y `Argon2PasswordHasher` real. | Persistencia atómica y fail-closed. |

`auth-use-cases.port.ts` no requirió cambios: `LoginCommand`/`IssuedTokenPair` ya eran compatibles. No se
cableó el caso de uso en módulos (AUTH-072).

## Comportamiento verificado

- **Solo ACTIVE + ACTIVE crea sesión.** El contrato de Users solo devuelve identidad `ACTIVE`; el login exige
  credencial `ACTIVE`; cualquier otra rama usa el hash señuelo y responde 401 genérico.
- **Atomicidad.** `Session` + primer `RefreshToken` se insertan en la misma transacción; el contador de fallos
  se limpia **dentro** del UoW antes del commit. Si `clear` falla, se revierte todo y se responde 503. Si la
  persistencia falla, no se devuelven tokens.
- **Sin enumeración.** Identidad inexistente, credencial ausente/inactiva y password errónea comparten
  `InvalidCredentialsError` (401) y código/detalle; el sexto fallo pasa a 429.
- **Sin PII.** Solo se persiste el HMAC-SHA256 (64 hex) del refresh; el raw nunca se guarda ni aparece en la
  fila. El correo no se persiste ni se consulta `users_db`.
- **Rate limit.** `inspect` ocurre antes de Users/Argon2; fallos de dependencia (Users/DB/Redis) no incrementan
  el contador de credencial.
- **Contrato.** `expiresIn` 3600, `absoluteExpiresAt` login+7d, `principal` tomado de la `Session`; el access
  verifica `sub/sid/role/jti` y `exp-iat=3600` con el firmante real.

## Evidencia de comandos

```sh
npm run typecheck   # OK
npm run lint        # OK
npm run build       # OK
npm run test:unit   # 14 suites, 114 tests (login.use-case 22/22)
npm run test:security   # 2 suites, 46 tests
npm run test:contract   # 133 pasan + 1 RED esperado (trim de email, AUTH-071)

TEST_AUTH_DATABASE_URL="postgresql://stayhub_auth_test:test_password@127.0.0.1:55432/auth_test" \
TEST_AUTH_REDIS_URL="redis://:test_redis_password@127.0.0.1:56379/15" \
AUTH_TEST_ALLOW_CLEANUP=true \
npm run test --workspace @stayhub/auth-service -- --selectProjects integration \
  --runTestsByPath test/integration/login-persistence.spec.ts   # 7/7

# Proyecto de integración completo: 10 suites, 93 tests, 0 fallos
```

## Criterios de aceptación

- [x] Solo User ACTIVE + Credential ACTIVE crea sesión.
- [x] La sesión y primer refresh existen juntos, tokens solo después del commit (rollback ante fallo).
- [x] No permite enumeración por mensaje/código (401 idéntico).

## Pendiente / handoff

- **AUTH-067:** rotación productiva sobre `SessionUnitOfWork` (usará `issueForSession` de AUTH-066).
- **AUTH-071:** los controladores de login expondrán este caso de uso (el RED de `trim` de email en el
  controlador sigue pendiente y es de esa tarea).
- **AUTH-072:** registrar `LoginService` (`LOGIN_USE_CASE`) y sus adapters en composición.
- **AUTH-074:** reejecutar la matriz de login/sesiones como cierre de la historia.
- Sin bloqueos de infraestructura.
