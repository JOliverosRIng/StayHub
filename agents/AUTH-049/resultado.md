# AUTH-049 — Resultado de ejecución

Fecha: 2026-09-28. Base revisada: commit `393a80d`, rama `Auth_Service`. Estado: **Prueba preparada (RED)**.

Dependencias leídas: PRE-001, PRE-004 (ambas verificadas localmente). Reglas aplicadas: D01, D02, D04–D06, D08–D10.

## Objetivo

Preparar la suite de contrato HTTP de login (`POST /internal/v1/login`) antes de que exista
`LoginController` (AUTH-071), dejando evidencia RED de conducta ausente y GREEN contra un fixture
test-local con guard, pipe y filtro reales.

## Cambios realizados

| Archivo | Cambio | Motivo |
|---|---|---|
| `apps/auth-service/test/contract/login.contract.spec.ts` | **Nuevo**. Suite de contrato con `LoginFixtureController` test-local, doble tipado de `LOGIN_USE_CASE`, `ServiceAuthGuard`/pipe/filtro reales, `ServiceJwtVerifier` real y claves RSA efímeras. | No existe aún el controlador productivo; el fixture sostiene la matriz y se sustituye por `LoginController` en AUTH-071. |

No se modificó código productivo. El fixture vive solo en `test/` y está rotulado como tal. No fue
necesario tocar `auth-app.ts` ni `crypto-fixture.ts`.

## Cobertura de la matriz

- **Ruta ausente (RED):** contra la composición de producción (sin el fixture) `POST /internal/v1/login`
  devuelve 404; documenta el hueco hasta AUTH-071.
- **Happy path:** 200 para `GUEST`, `OWNER` y `ADMIN` con `InternalTokenPair` completo; `expiresIn === 3600`
  entero; `absoluteExpiresAt` ISO válido; `principal` con `userId`/`sessionId` UUID y `role`; sin `Set-Cookie`.
- **Reenvío:** email (caso conservado), password exacta y `traceId` llegan al caso de uso; password con
  espacios y Unicode (`p ässw🔒8`) transmitida sin cambios.
- **400 (9 casos) antes del caso de uso:** `role`, `userId`, campo desconocido, email `null`/malformado,
  password ausente/`null`/numérica/>128. `execute` no se invoca.
- **401 genérico:** `InvalidCredentialsError` produce un `problem+json` **idéntico** (mismo `traceId`, mismo
  cuerpo) para identidad ausente, password errónea y cuenta inactiva; sin filtrar existencia.
- **429:** `LoginRateLimitError` → `problem+json` con `code LOGIN_RATE_LIMITED`; el cuerpo no contiene el
  password. La cabecera `Retry-After` se comprueba aparte (RED, ver abajo).
- **503:** `DependencyUnavailableError` → `DEPENDENCY_UNAVAILABLE`.
- **401 service JWT (7 casos):** sin bearer; firma con clave foránea (mismo `kid`); issuer/audience/scope
  incorrectos; token vencido; el rechazo no invoca el caso de uso.
- **Secretos:** ningún `problem` de error contiene el password ni el email.

## Evidencia de comandos

Ejecutado desde la raíz del monorepo:

```sh
npm run typecheck   # OK
npm run lint        # OK
npm run test --workspace @stayhub/auth-service -- --selectProjects contract \
  --runTestsByPath test/contract/login.contract.spec.ts
```

Resultado de la suite: **1 suite, 27 tests: 25 pasan, 2 fallan (RED esperado)**.

### RED esperado (conducta ausente, no importación/entorno)

1. `accepts an email with outer whitespace trimmed before the use case` → esperado `200`, recibido `400`.
   Porque `LoginRequest` aún no aplica `@Transform` de `trim` y `@IsEmail` rechaza el correo con espacios.
2. `sets an integer Retry-After header >= 1` → esperado cabecera entera `>= 1`, recibida ausente.
   Porque `ProblemDetailsFilter` todavía no emite `Retry-After` para `LoginRateLimitError`.

Ambos se volverán GREEN con AUTH-071/073 (normalización del DTO y controlador real) y AUTH-064 (cabecera
`Retry-After` derivada del TTL de Redis).

## Criterios de aceptación

- [x] Éxito, validación, antiabuso y autenticación de servicio están cubiertos.
- [x] Los tokens solo aparecen en el éxito esperado; los `problem` de error no filtran password ni email.

## Pendiente / handoff

- **AUTH-071:** reemplazar `LoginFixtureController` (en el spec) por `LoginController`, quitar el test RED de
  ruta ausente y re-ejecutar la suite para GREEN. AUTH-065 concreta la normalización lowercase en el caso de uso.
- **AUTH-064:** añadir `Retry-After` entero `>= 1` en el filtro para `LoginRateLimitError`.
- **AUTH-073:** documentar el 400 observable y el `429` con `Retry-After` en el contrato/Swagger.
- Sin bloqueos de infraestructura: la suite es de contrato y no requiere PostgreSQL/Redis.
