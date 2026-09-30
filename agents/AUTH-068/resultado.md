# AUTH-068 — Resultado de ejecución

Fecha: 2026-09-29. Base revisada: commit `393a80d`, rama `Auth_Service`. Estado: **Implementado local (GREEN)**.

Dependencias leídas: AUTH-057 (prueba preparada). Reglas aplicadas: D01, D02, D04–D06, D08–D10.

## Objetivo

Implementar la introspección autoritativa de sesión (D06): PostgreSQL decide siempre (revocación inmediata),
los inválidos devuelven un 401 genérico sin revelar la causa, la caché es best-effort y solo se escribe con
un `accessTokenExpiresAt` confiable, acotada por token y sesión. Sustituye la referencia test-local de AUTH-057.

## Cambios realizados

| Archivo | Cambio | Motivo |
|---|---|---|
| `src/application/sessions/validate-session.use-case.ts` | **Nuevo.** `ValidateSessionService implements ValidateSessionUseCase`: lee hint de caché, carga `Session` de PostgreSQL (fallo → `DependencyUnavailableError`), exige `userId` e `isActive(now)`, invalida caché obsoleta best-effort y devuelve `{active:true, role}`; escribe caché positiva con `TTL = min(exp-now, absoluteExpiry-now)` (floor, `>0`). | No existía la decisión de sesión productiva. |
| `test/unit/validate-session.use-case.spec.ts` | **Nuevo.** 14 pruebas con dobles: tres roles, desconocida/revocada/vencida/mismatch, error de BD, `stale` no autoriza, fallos de caché ignorados y política de TTL. | Matriz unitaria del caso de uso. |
| `test/integration/session-validation.spec.ts` | Migrada a `ValidateSessionService` productivo (17/17) sobre PostgreSQL/Redis reales. | Reejecutar AUTH-057 contra producción. |
| `test/helpers/reference-session-validation.ts` | Se elimina `ReferenceValidateSessionService`; quedan `ThrowingSessionRepository` y `UnavailableAuthCache`. | Cumplir el handoff de AUTH-057. |

No se cableó el caso de uso en módulos (AUTH-072).

## Comportamiento verificado

- **Autoridad PostgreSQL.** Cada `execute` lee la sesión; un hit positivo en caché nunca autoriza por sí solo.
  Una sesión revocada por replay (u otro motivo) se rechaza de inmediato y el hit obsoleto se invalida.
- **Contrato genérico.** Inexistente, `userId` distinto, revocada y vencida producen el mismo
  `SessionInvalidError` (401), sin distinguir la causa.
- **Dependencias.** Fallo de BD → `DependencyUnavailableError` (503) incluso con hit positivo; Redis caído o
  JSON corrupto se ignoran y la validación continúa contra PostgreSQL.
- **Política de caché positiva.** Sin `accessTokenExpiresAt` no se escribe; con expiry confiable el TTL es
  `min(token, sesión)` en segundos con floor y se omite si `<= 0`; los errores de `set`/`delete` no fallan la
  respuesta.
- **Rol/Users.** Se conserva el rol autoritativo de la sesión y no se consulta Users.

## Evidencia de comandos

```sh
npm run typecheck   # OK
npm run lint        # OK
npm run build       # OK
npm run test:unit   # 16 suites, 137 tests (validate-session 14/14)
npm run test:security   # 2 suites, 46 tests
npm run test:contract   # 133 pasan + 1 RED esperado (trim de email, AUTH-071)

TEST_AUTH_DATABASE_URL="postgresql://stayhub_auth_test:test_password@127.0.0.1:55432/auth_test" \
TEST_AUTH_REDIS_URL="redis://:test_redis_password@127.0.0.1:56379/15" \
AUTH_TEST_ALLOW_CLEANUP=true \
npm run test --workspace @stayhub/auth-service -- --selectProjects integration \
  --runTestsByPath test/integration/session-validation.spec.ts   # 17/17

# Proyecto de integración completo: 10 suites, 94 tests, 0 fallos
```

## Criterios de aceptación

- [x] Cada autorización depende del estado PostgreSQL vigente.
- [x] La ruta interna conserva su input (`sessionId`/`userId`) y no inventa `exp`.
- [x] Tres roles y las causas 401/503 están probadas.

## Pendiente / handoff

- **AUTH-069:** Passport/guards de usuario consumirán la validación (`VALIDATE_SESSION_USE_CASE`).
- **AUTH-071/072:** exponer la introspección en `SessionsController` y componer el caso de uso.
- **AUTH-074:** cierre de la historia de autenticación.
- Sin bloqueos de infraestructura.
