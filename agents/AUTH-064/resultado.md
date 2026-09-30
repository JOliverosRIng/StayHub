# AUTH-064 — Resultado de ejecución

Fecha: 2026-09-29. Base revisada: commit `393a80d`, rama `Auth_Service`. Estado: **Implementado local (GREEN)**.

Dependencias leídas: AUTH-056 (verificada, prueba preparada GREEN referencial) y PRE-004 (verificada local).
Reglas aplicadas: D01, D02, D04–D06, D08–D10.

## Objetivo

Implementar el `LoginRateLimiter` productivo y el `Retry-After` HTTP (D05): ventana fija de 900 s,
contador atómico en Redis, HMAC-SHA256 del identificador separado del refresh/fingerprint, `Retry-After`
entero derivado del TTL real y fail-closed ante fallos de Redis. Se mueve el Lua atómico que vivía en la
referencia de AUTH-056 a la infraestructura productiva.

## Cambios realizados

| Archivo | Cambio | Motivo |
|---|---|---|
| `src/infrastructure/config/auth-config.ts` | Nuevo `loginIdentifierHmacSecret` (≥32) desde `AUTH_LOGIN_IDENTIFIER_HMAC_SECRET`, separado de refresh y fingerprint. | H08: faltaba el secreto dedicado del identificador. |
| `.env.example` | Añade `AUTH_LOGIN_IDENTIFIER_HMAC_SECRET=replace-with-at-least-32-characters`. | Documentar la variable. |
| `src/application/ports/cache.port.ts` | `LoginFailureWindow {count,ttlSeconds}`; `readLoginFailures(hash)` y `recordLoginFailure(hash,windowSeconds)`; conserva `clearLoginFailures`. | H08: el cache no leía count/TTL. |
| `src/infrastructure/cache/auth-cache.adapter.ts` | Sustituye `MULTI` por dos scripts Lua (`READ`/`RECORD`) con `INCR`+`PEXPIRE`+`PTTL`; repara TTL ausente de forma atómica; `DependencyUnavailableError` ante fallo Redis. Cliente Redis opcional inyectable (seam de test). | Atómico y fail-closed; la referencia de AUTH-056 se vuelve productiva. |
| `src/application/login/login-rate-limiter.ts` | **Nuevo.** `LoginRateLimiter` (puerto), token `LOGIN_RATE_LIMITER` y `LoginRateLimiterService`: normaliza, HMAC-SHA256 hex, `inspect` bloquea `count>=6`, `recordFailure` lanza 429 al sexto sin prolongar ventana, `clear` en éxito; errores Redis → `DependencyUnavailableError`; `Retry-After=max(1,ceil(ttl))`. | Implementación D05 sin Nest/Prisma/Redis directo. |
| `src/interfaces/http/problem.filter.ts` | Añade `Retry-After` entero ≥1 cuando la excepción es `LoginRateLimitError`; el cuerpo sigue genérico. | H08 / caso RED de AUTH-049. |
| `test/helpers/reference-login.ts` | Reexporta el `LoginRateLimiter` productivo (elimina la interfaz local). | Evitar duplicación; AUTH-056/AUTH-052 siguen compilando. |
| `test/helpers/reference-session-validation.ts` | `UnavailableAuthCache` implementa las nuevas operaciones de rate limit. | Ajuste de la interfaz `AuthCache`. |
| `test/helpers/crypto-fixture.ts`, `test/unit/access-token.spec.ts`, `test/unit/argon2-password-hasher.spec.ts`, `test/unit/auth-config.spec.ts` | Añaden `loginIdentifierHmacSecret`. | Fixtures de `AuthConfig` completo. |
| `test/unit/login-rate-limiter.spec.ts` | **Nuevo.** 11 pruebas de HMAC (64 hex, sin correo, variantes), límites 5→pass/6→429, `clear`, `Retry-After` mínimo 1 y fail-closed. | Cálculo HMAC y límites. |
| `test/integration/login-rate-limit.spec.ts` | Migrada a `LoginRateLimiterService` + `AuthCacheAdapter` productivos sobre Redis 7 real; añade reparación de TTL ausente. | Reejecutar AUTH-056 contra producción. |
| `test/helpers/reference-redis-rate-limiter.ts` | **Eliminado.** | Reemplazado por el adapter productivo. |

## Comportamiento verificado

- **Sin PII:** la clave es `auth:login-failures:<HMAC-SHA256>` (64 hex); ninguna key contiene el correo.
- **Ventana fija:** fallos 1–5 → 401 y sexto → 429; los intentos bloqueados no prolongan el TTL; `inspect`
  corta antes de Users/Argon2.
- **Normalización:** variantes de mayúsculas/espacios comparten contador (mismo hash).
- **Limpieza:** un login válido limpia el contador antes de confirmar; el siguiente fallo vuelve a 401.
- **TTL:** con la clave sin expiración, `readLoginFailures` la repara de forma atómica y devuelve TTL > 0;
  `Retry-After` nunca es negativo ni cero.
- **Concurrencia:** 12 fallos simultáneos dejan exactamente 12 con TTL presente (Lua evita carreras).
- **Fail closed:** Redis inaccesible → `DependencyUnavailableError` sin crear sesión; `clear` fallido revierte
  la transacción (sin sesión ni refresh).
- **HTTP:** `ProblemDetailsFilter` agrega `Retry-After` entero ≥1 al 429; el cuerpo sigue siendo el problema
  genérico. El limiter no registra logs; el filtro solo registra `code/status/traceId`.

## Evidencia de comandos

Postgres 16 / Redis 7 de `infra/docker/auth/compose.test.yml` (Podman, healthy). Node 22.22.2 (engines piden
20; solo warnings).

```sh
npm run typecheck   # OK
npm run lint        # OK
npm run build       # OK
npm run test:unit   # 13 suites, 102 tests, 0 fallos (incluye login-rate-limiter 11/11)
npm run test:security   # 2 suites, 46 tests
npm run test:contract   # 6 suites, 133 pasan + 1 RED esperado (trim de email, AUTH-071)

TEST_AUTH_DATABASE_URL="postgresql://stayhub_auth_test:test_password@127.0.0.1:55432/auth_test" \
TEST_AUTH_REDIS_URL="redis://:test_redis_password@127.0.0.1:56379/15" \
AUTH_TEST_ALLOW_CLEANUP=true \
npm run test --workspace @stayhub/auth-service -- --selectProjects integration \
  --runTestsByPath test/integration/login-rate-limit.spec.ts   # 11/11

# Proyecto de integración completo: 9 suites, 86 tests, 0 fallos
```

## Criterios de aceptación

- [x] Quinto fallo 401 y sexto 429, recuperación automática y limpieza en éxito.
- [x] Todos los paths Redis fallan cerrado 503 cuando corresponde.
- [x] `Retry-After` coincide con el tiempo restante (derivado del `PTTL` real; mínimo 1).
- [x] `AUTH-049` pasa de 2 casos RED a 1 RED: el de `Retry-After` queda GREEN.

## Pendiente / handoff

- **AUTH-065:** consumir `LoginRateLimiterService` en el `LoginUseCase` productivo (`LOGIN_RATE_LIMITER`).
- **AUTH-072:** registrar el limiter y el adapter en el módulo de login/sesiones.
- **AUTH-071:** el caso RED de `trim` de email en login sigue pendiente; no es de AUTH-064.
- **AUTH-083:** correlación/telemetría y auditoría final de secretos (el limiter no loggea identificadores).
- Sin bloqueos de infraestructura.
