# AUTH-057 — Resultado de ejecución

Fecha: 2026-09-28. Base revisada: commit `393a80d`, rama `Auth_Service`. Estado: **Prueba preparada (GREEN contra referencia test-local; implementación productiva pendiente en AUTH-068)**.

Dependencias leídas: PRE-003 y PRE-004 (verificadas localmente). Reglas aplicadas: D01, D02, D04–D06, D08–D10.

## Objetivo

Acreditar sobre PostgreSQL 16 y Redis 7 la validación de sesión autoritativa y la política de caché (D06):
PostgreSQL manda, un hit positivo no evita la lectura, la caché es best-effort y las sesiones revocadas por
replay se invalidan de inmediato. `ValidateSessionUseCase` productivo es AUTH-068.

## Cambios realizados

| Archivo | Cambio | Motivo |
|---|---|---|
| `apps/auth-service/test/helpers/reference-session-validation.ts` | **Nuevo**. `ReferenceValidateSessionService` (referencia del futuro `ValidateSessionUseCase`, AUTH-068) con PostgreSQL autoritativo y caché best-effort; dobles `ThrowingSessionRepository` y `UnavailableAuthCache`. | No existe el caso de uso productivo; la referencia codifica D06 y AUTH-068 la sustituye. |
| `apps/auth-service/test/integration/session-validation.spec.ts` | **Nuevo**. 17 pruebas con `PrismaSessionRepository` y `AuthCacheAdapter` reales. | Validación, caché obsoleta/corrupta, fallos de dependencia y TTL. |

No se modificó código productivo.

## Cobertura de la matriz

- **Sesiones válidas:** `GUEST`/`OWNER`/`ADMIN` → `{active:true, role}` con el rol autoritativo de la sesión.
- **Inválidas (401 genérico `SessionInvalidError`):** sesión desconocida, `userId` distinto, revocada, vencida
  y revocada por replay.
- **Caché obsoleta:** un hit `ACTIVE` en caché no resucita una sesión revocada en PostgreSQL; además se
  invalida el hit.
- **Autoridad PostgreSQL:** con la BD caída y un hit positivo en caché → 503; con Redis caído y sesión activa
  en BD → 200.
- **Caché corrupta:** JSON inválido en caché se ignora (no 500).
- **Política de caché positiva:** no se escribe sin `accessTokenExpiresAt`; con expiry confiable el TTL es
  `min(exp-now, absoluteExpiry-now)` (acotado por token y por sesión) y nunca `<= 0`.
- **Rol/Users:** la validación conserva el rol de la sesión y no consulta Users (el spy no se invoca).

## Evidencia de comandos

Postgres 16 / Redis 7 de `infra/docker/auth/compose.test.yml` (Podman, healthy).

```sh
npm run typecheck   # OK
npm run lint        # OK
TEST_AUTH_DATABASE_URL="postgresql://stayhub_auth_test:test_password@127.0.0.1:55432/auth_test" \
TEST_AUTH_REDIS_URL="redis://:test_redis_password@127.0.0.1:56379/15" \
AUTH_TEST_ALLOW_CLEANUP=true \
npm run test --workspace @stayhub/auth-service -- --selectProjects integration \
  --runTestsByPath test/integration/session-validation.spec.ts   # 17/17
```

Proyecto de integración completo: **9 suites, 85 tests, 0 fallos**.

## Criterios de aceptación

- [x] Ningún cache hit evita comprobar la revocación autoritativa.
- [x] Las políticas Redis de caché y rate limit quedan diferenciadas (claves `auth:session:` vs
  `auth:login-failures:`).
- [x] Se respeta el contrato HTTP sin inventar `exp`: sin `accessTokenExpiresAt` no se escribe caché positiva.

## Pendiente / handoff

- **AUTH-068:** sustituir `ReferenceValidateSessionService` por el caso de uso productivo y re-ejecutar esta
  suite; implementar invalidación de caché en la ruta de error.
- **AUTH-071:** el controlador de introspección no transporta `exp`, por lo que la ruta HTTP no cachea
  resultados positivos.
- Sin bloqueos de infraestructura.
