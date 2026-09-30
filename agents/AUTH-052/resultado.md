# AUTH-052 — Resultado de ejecución

Fecha: 2026-09-28. Base revisada: commit `393a80d`, rama `Auth_Service`. Estado: **Prueba preparada (GREEN contra referencia test-local; implementación productiva pendiente en AUTH-065)**.

Dependencias leídas: PRE-001, PRE-004 (ambas verificadas localmente). Reglas aplicadas: D01, D02, D04–D06, D08–D10.

## Objetivo

Preparar la matriz unitaria de `LoginUseCase` antes de que exista la clase productiva (AUTH-065), con puertos
dobles y una implementación **de referencia** test-local que codifica la orquestación D05.

## Cambios realizados

| Archivo | Cambio | Motivo |
|---|---|---|
| `apps/auth-service/test/helpers/reference-login.ts` | **Nuevo**. `ReferenceLoginService` (referencia test-local del futuro `LoginUseCase`), interfaces `LoginRateLimiter`/`SessionTokensIssuer` y dobles `FakeLoginRateLimiter`/`FakeSessionUnitOfWork`/`FakeSessionTokensIssuer`/`FakeCredentialRepository`/`FakePasswordHasher`/`StubClock`. | No existe `LoginUseCase` ni rate limiter/issuer productivos; la referencia sostiene la matriz y AUTH-065 la sustituye. |
| `apps/auth-service/test/unit/login.use-case.spec.ts` | **Nuevo**. Matriz de ramas de login. | Cubre éxito, negativos, normalización, rate limit y fallos de dependencia. |
| `apps/auth-service/test/unit/argon2-password-hasher.spec.ts` | **Nuevo**. Pruebas con Argon2 real del hasher existente. | Exactitud, Argon2id, hash inválido y hash señuelo. |

No se modificó código productivo. La referencia y los dobles viven solo en `test/`.

## Cobertura de la matriz

- **Éxito (GUEST/OWNER/ADMIN):** identidad `ACTIVE` + credencial `ACTIVE` + password correcta crea sesión y
  primer refresh en el UoW; `expiresIn` 3600, `absoluteExpiresAt` login+7d, `principal` de la sesión, limpieza
  del contador y tokens solo tras la transacción. Se persiste únicamente el hash (64 hex), nunca el raw token.
- **Negativos (mismo `InvalidCredentialsError`, cero Session/Refresh):** identidad ausente, identidad inactiva
  (representada como ausencia), credencial ausente/PENDING/REVOKED y password incorrecta. En todas las ramas
  sin hash activo se invoca `verifyWithEquivalentCost(null, password)`.
- **Seguridad independiente del hasher:** aunque `verifyWithEquivalentCost` devuelva `true`, una identidad
  inexistente o una credencial no `ACTIVE` no se autentican.
- **Normalización:** el email se recorta y se pasa en minúsculas a Users; el password se mantiene exacto
  (espacios/Unicode). La identidad se resuelve en Users en cada login (sin copia local).
- **Rate limit:** `inspect` ocurre antes de Users/Argon2; un bloqueo previo lanza 429 sin tocar Users/Argon2;
  fallos 1–5 → 401 y el sexto → 429; el éxito limpia el contador y permite un nuevo fallo 401.
- **Fallos de dependencia (fail closed):** Users caído no incrementa el contador de credencial; fallo de DB
  al cargar la credencial propaga 503; si falla `clear` (Redis) se revierte la sesión y no se devuelven tokens;
  fallo del UoW propaga sin tokens.
- **Hasher (Argon2 real):** hash `$argon2id$`, verificación exacta (Unicode incluido), sal distinta por hash,
  hash malformado/vacío → `false` sin lanzar, y `verifyWithEquivalentCost(null, ...)` usa el señuelo.

## Evidencia de comandos

Ejecutado desde la raíz del monorepo:

```sh
npm run typecheck   # OK
npm run lint        # OK
npm run test --workspace @stayhub/auth-service -- --selectProjects unit \
  --runTestsByPath test/unit/login.use-case.spec.ts test/unit/argon2-password-hasher.spec.ts
```

Resultado: **2 suites, 26 tests: 26 pasan** (22 de login + 4 del hasher).

## Criterios de aceptación

- [x] Todas las ramas negativas conservan 401 genérico o 503 por dependencia y no crean tokens.
- [x] La seguridad no depende solo del boolean del hasher.

## Pendiente / handoff

- **AUTH-065:** sustituir `ReferenceLoginService` por el `LoginUseCase` productivo (y eliminar la referencia);
  la matriz decide el orden `rate limit → Users → Credential → Argon2 → sesión/UoW`.
- **AUTH-063/064/066:** aportar el lookup real, el rate limiter (`inspect`/`recordFailure`/`clear` con Redis) y
  el emisor de tokens que aquí se simulan con dobles.
- **AUTH-056:** validar contadores/ventana con Redis real (aquí la semántica de ventana es del doble).
- Sin bloqueos de infraestructura: la suite es unitaria y no requiere PostgreSQL/Redis.
