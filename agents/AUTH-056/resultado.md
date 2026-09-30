# AUTH-056 — Resultado de ejecución

Fecha: 2026-09-28. Base revisada: commit `393a80d`, rama `Auth_Service`. Estado: **Prueba preparada (GREEN contra referencia test-local; implementación productiva pendiente en AUTH-064)**.

Dependencias leídas: PRE-001 (verificada localmente). Reglas aplicadas: D01, D02, D04–D06, D08–D10.

## Objetivo

Acreditar sobre Redis 7 real la política de rate limit de login (D05): ventana fija de 900 s, contador atómico,
HMAC del identificador, `Retry-After` acotado y fail-closed, antes de que exista el `LoginRateLimiter`
productivo (AUTH-064).

## Cambios realizados

| Archivo | Cambio | Motivo |
|---|---|---|
| `apps/auth-service/test/helpers/reference-redis-rate-limiter.ts` | **Nuevo**. `ReferenceRedisLoginRateLimiter` con Lua atómico (`INCR`+`PEXPIRE`+`PTTL`) sobre la interfaz `LoginRateLimiter` de AUTH-052. | No existen `readLoginFailures`/Lua ni secreto en `AuthCacheAdapter`; la referencia prueba D05 y AUTH-064 la mueve al adaptador. |
| `apps/auth-service/test/integration/login-rate-limit.spec.ts` | **Nuevo**. 10 pruebas sobre Redis 7 (DB15) y `ReferenceLoginService`. | Contadores, variantes de correo, limpieza, bloqueo, expiración, concurrencia y fail-closed. |

No se modificó código productivo. No se tocó `auth-app.ts`: el `Retry-After` HTTP sigue cubierto como RED en
AUTH-049 y su GREEN corresponde a AUTH-064/071.

## Cobertura de la matriz

- **Sin PII en claves:** la clave es `auth:login-failures:<HMAC-SHA256>` (64 hex); no contiene el correo.
- **Ventana fija:** fallos 1–5 → 401 (`InvalidCredentialsError`) y el sexto → 429 (`LoginRateLimitError`) con
  `Retry-After` entre 1 y 900; los intentos bloqueados no prolongan el TTL.
- **Normalización:** variantes de mayúsculas/espacios comparten contador.
- **Limpieza:** un login válido limpia el contador antes de confirmar; el siguiente fallo vuelve a ser 401.
- **Bloqueo autoritativo:** con contador ≥ 6, `inspect` corta antes de Users y Argon2 (no se invocan).
- **Expiración:** con `PEXPIRE` corto se inicia una ventana nueva (primer fallo vuelve a ser 401).
- **Concurrencia:** 12 fallos simultáneos dejan exactamente 12 y TTL presente (Lua evita carreras del
  `GET`/`INCR` no atómico).
- **Fail closed:** Redis inaccesible (puerto cerrado) → `DependencyUnavailableError` sin crear sesión; si falla
  `clear`, la transacción de login se revierte y no quedan sesión/refresh.

## Evidencia de comandos

Postgres 16 / Redis 7 de `infra/docker/auth/compose.test.yml` (Podman, healthy).

```sh
npm run typecheck   # OK
npm run lint        # OK
TEST_AUTH_DATABASE_URL="postgresql://stayhub_auth_test:test_password@127.0.0.1:55432/auth_test" \
TEST_AUTH_REDIS_URL="redis://:test_redis_password@127.0.0.1:56379/15" \
AUTH_TEST_ALLOW_CLEANUP=true \
npm run test --workspace @stayhub/auth-service -- --selectProjects integration \
  --runTestsByPath test/integration/login-rate-limit.spec.ts   # 10/10
```

Proyecto de integración completo: **8 suites, 68 tests, 0 fallos**.

## Criterios de aceptación

- [x] Ventana fija y cabecera derivada del TTL, sin hardcodear 900 en cada respuesta (`Retry-After` sale del
  `PTTL` real).
- [x] Redis no disponible nunca deja pasar autenticación (fail closed).
- [x] Todos los escenarios corren sobre Redis real.

## Pendiente / handoff

- **AUTH-064:** mover el Lua a `AuthCacheAdapter` (`readLoginFailures`), añadir
  `AUTH_LOGIN_IDENTIFIER_HMAC_SECRET`, el `LoginRateLimiter` de aplicación y `Retry-After` en el filtro.
- **AUTH-065/072:** re-ejecutar con persistencia real de sesión (aquí el rollback de `clear` usa el UoW doble
  de AUTH-052).
- **AUTH-049:** su caso RED de `Retry-After` pasará a GREEN cuando AUTH-064 conecte el filtro.
- Sin bloqueos de infraestructura.
