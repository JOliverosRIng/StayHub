# Validación — Grupo 2: users-service

## Checkpoint y procedencia de la evidencia

Rama `feat/users-perfil-authz`; checkpoint conservado: `fb18495`.
Los siguientes resultados fueron **verificados por el usuario, no reejecutados**
en esta continuación (2026-09-29). No acreditan integración con Auth/Gateway ni
una ejecución remota de GitHub Actions.

| Comprobación del checkpoint | Resultado comunicado por el usuario |
|---|---|
| Lint y typecheck | Sin errores |
| Pruebas | 23 suites, 142 pruebas, todas verdes |
| Cobertura combinada | Sentencias 96,15%; ramas 89,95%; funciones 95,23%; líneas 98,05%; umbral 70% cumplido |
| Docker | Build multi-stage correcto; usuario `node`; healthcheck `/health/ready` |
| Compose | Configuración válida con variables de prueba; 3002 no publicado |
| Artefactos existentes | Dockerfile, Compose, CI, validador OpenAPI y migraciones `create_users`/`add_profile_photo` |
| USR-047 / P2028 | Resuelto usando `127.0.0.1` en USERS_TEST_DATABASE_URL en Windows/Docker Desktop; no se modifican timeouts ni el repositorio por este incidente |

## Trazabilidad de pruebas

La trazabilidad siguiente es **a nivel de archivo de prueba**, con el mapeo
proporcionado por el usuario; no es un análisis de cada `it()`.
Todas las rutas son relativas a `apps/users-service/test/`.

| Historia / checkpoint | Requisitos | Archivos de evidencia |
|---|---|---|
| US1 — USR-037 | RQ-02, FR-001 a FR-006 | `contract/registration.contract.spec.ts`; `unit/registration-policy.spec.ts`; `integration/registration-concurrency.spec.ts`; `integration/registration-state.spec.ts`; `security/service-auth.spec.ts` |
| US3 — USR-060 | RQ-01, FR-014 a FR-019, FR-023 | `contract/profile.contract.spec.ts`; `unit/profile-validation.spec.ts`; `integration/profile-update.spec.ts`; `integration/profile-photo.spec.ts`; `unit/photo-policy.spec.ts` |
| US4 — USR-070 | FR-020 a FR-024, SC-004 | `security/jwt-hardening.spec.ts`; `unit/profile-authorization.spec.ts`; `integration/profile-ownership.spec.ts`; `integration/profile-restricted-fields.spec.ts`; `unit/roles.spec.ts`; `security/secret-leakage.spec.ts` |

## Pendientes externos de G2

| USR | Estado | Parte Users existente | Falta / responsable |
|---|---|---|---|
| 071 | BLOQUEADA | Endpoints y pruebas de registro provider de US1 | G3: cliente/orquestador real, service JWT compatible, timeout/retry y registro coordinado |
| 072 | BLOQUEADA | Lookup ACTIVE y pruebas de identidad | G3: consumidor lookup y login genérico real con correo vigente |
| 073 | BLOQUEADA | Perfil, foto, bearer, ownership y pruebas directas Users | G1: routing, introspección con G3, stripping, forwarding, timeouts y streaming reales |
| 074 | PARCIAL | Contrato y drift válidos; nueva suite `contract/users-provider.contract.spec.ts` y fixtures de entrega | G1/G3: expectativas consumidor aprobadas y ejecución conjunta provider/consumer |
| 075 | PARCIAL | Compose real verificado: migración exit 0 antes del servicio healthy, red interna y sin puertos publicados | G1 debe integrar red/readiness conjunta y completar 071–073 |
| 076 | PARCIAL | Validador OpenAPI, prueba de secretos y etapas CI revisados | Cierre conjunto condicionado por USR-074; CI remota no ejecutada |
| 077 | BLOQUEADA | Fixtures sintéticos y pruebas directas Users | G1 coordina E2E HTTPS; G3 entrega Auth operativo. No hay evidencia de flujo completo |
| 078 | PARCIAL | Evidencia local comunicada del checkpoint | Ejecución final, Compose, CI remota, revisión independiente y resultados coordinados G1/G3 |

## Revisión contractual y CI (ejecutada en esta continuación)

Comparación semántica de `66d539c` con `fb18495`: se conservan las nueve
operaciones, seguridad bearer/service JWT, enums y campos obligatorios de
requests/respuestas exitosas. Se conservan las adiciones 401/403 en operaciones
internas, 400/404 donde corresponden y 503 de indisponibilidad. Problem Details
exige ahora también `detail`, `instance` y `errors`, conforme a USR-012.
El cambio de referencias a esquemas inline no elimina restricciones.
No fue necesario revertir ni modificar el contrato. El validador
`node scripts/validate-users-openapi.mjs` terminó con exit 0: contrato válido,
paths/schemas/security coincidentes con Swagger generado.

El límite conservado es **5.000.000 bytes**. La expresión «5 MiB» encontrada en
documentación equivale a 5.242.880 bytes y es imprecisa; no cambia la regla ni se
modifican documentos fuera del alcance autorizado.

CI contiene instalación locked, Prisma generate/deploy, typecheck, lint,
cobertura unitaria, cobertura combinada, build, drift OpenAPI y Docker build.
USR-009/076 automatizan estos controles. La constitución exige 70% **unitario**;
el backlog habla de cobertura afectada. La cifra combinada del usuario no prueba
por sí sola el umbral unitario: CI conserva ambos controles y ningún umbral se
reduce. La revisión del YAML no acredita una ejecución remota de Actions.

## Compose real de G2

Proyecto aislado `stayhub-users-g2-validation`, secretos efímeros en el directorio
temporal del sistema **fuera del repositorio**. Primer intento exitoso, sin
reintentos. El build necesario para `compose up --build` ejecutó Prisma generate
6.19.0 y build TypeScript con éxito. No se recreó el PostgreSQL de pruebas existente.

- `users-db`: healthy, volumen propio y `5432/tcp: null` (sin publicación).
- `users-migrate`: exit 0; aplicó `202609280001_create_users` y
  `202609280002_add_profile_photo`; finalizó 2026-09-29 09:29:44.076930393 UTC.
- `users-service`: inició 09:29:44.377821607 UTC, después de la migración;
  healthy, usuario `node`, `3002/tcp: null`.
- Petición real dentro del contenedor a `/health/ready`: 200 `{"status":"ready"}`.
- Red `stayhub-users-g2-validation_internal`: `internal=true`.

Los contenedores de validación se mantienen disponibles. Los secretos temporales
deben conservarse mientras se utilice este proyecto. No hay collector real en
esta ejecución aislada: esto no acredita entrega OTLP ni integración G1/G3.
Durante `npm prune` el build informó 22 vulnerabilidades (1 baja, 13 moderadas,
8 altas). No se ejecutó una auditoría de alcanzabilidad ni se actualizaron las
versiones fijadas por Spec Kit; queda registrado para revisión de dependencias.

## Validación final de esta continuación

| Comando / control | Resultado real |
|---|---|
| `npm run typecheck:users` | Exit 0, una ejecución final |
| ESLint de los dos archivos TypeScript añadidos | Exit 0; lint completo anterior atribuido al usuario, no repetido |
| `npm run test:coverage --workspace @stayhub/users-service` | Una ejecución: 23 suites verdes, 1 fallida; 143 pruebas verdes, 1 fallida (24 suites/144 pruebas) |
| Corrección y ejecución dirigida de `users-provider.contract.spec.ts` | Exit 0: 1 suite, 2 pruebas verdes |
| Cobertura de la ejecución completa | 96,15% sentencias, 89,95% ramas, 95,23% funciones, 98,05% líneas; gate combinado 70% satisfecho |
| OpenAPI final | Exit 0; una ejecución final, además de la comprobación contractual inicial |
| Prisma generate / build | Exitosos dentro del build Compose requerido para el arranque |
| Migraciones reales | Las dos aplicadas mediante migrate deploy; exit 0 |
| Compose | Primer intento exitoso, Users healthy y readiness 200 |
| GitHub Actions remoto | No ejecutado; etapas revisadas, sin push |

Las 23 suites originales pasaron: 9 unitarias, 8 integration, 3 contract y
3 security. La única falla fue de la prueba provider **nueva**, que enviaba JSON
directo al PATCH multipart y recibía correctamente 415. Se corrigió la prueba
para usar el campo `profile`, sin tocar producción ni debilitar el contrato.
Se reejecutó solo esa suite: sus dos casos pasaron. No se repitió la suite
completa ni se presenta el primer comando como exitoso. La cobertura anterior
corresponde a esa ejecución completa, no a una segunda medición posterior.

## Alcance y auditoría de esta continuación

Se respetó la instrucción de revisión acotada: backlog Users, evidencia por
rutas, contrato Users (baseline/checkpoint), umbral de constitución, CI,
Docker/Compose, fixtures y adaptadores necesarios para la prueba nueva. No se
releyeron spec/plan/data-model completos ni suites existentes; se conservó su
auditoría previa. Arquitectura preservada: domain/application independientes,
puertos y adaptadores Prisma/HTTP, modules Nest, base exclusiva users_db.

Cambios nuevos: `.env.example`, README Windows, este reporte, estado raíz,
backlog Users y tres archivos de entrega provider. No cambian endpoints, DTO,
guards, repositorios, casos de uso, migraciones, Docker/Compose, CI ni telemetría
del checkpoint. El mapeo efectivo de errores permanece en `problem.filter.ts`
y `problem.mapper.ts`; los tres aliases sin consumidores se conservaron.

No se acredita retrospectivamente el orden red/green de pruebas preexistentes.
La nueva suite verifica funcionalidad existente y no requirió implementación
productiva. No se modificaron tasks.md, research.md, quickstart, checklists ni
contratos G1/G3. No existe `.specify/extensions.yml`: no hay hooks posteriores
que despachar. La tabla completa USR-001–078 está en `users-service-status.md`
en la raíz del repositorio.

---

# Validación — Grupo 1: api-gateway

## Checkpoint y procedencia de la evidencia

Rama `front-apigateway`, sincronizada con `origin/front-apigateway` mediante
`git pull --ff-only` (27 commits, merge `dc8f223`). Toda la evidencia siguiente
fue **ejecutada localmente en esta continuación** (2026-11-09); no se reutilizan
resultados de otros grupos ni se infiere una ejecución remota de GitHub Actions.

## Resultado de la suite del Gateway

| Comando / control | Resultado real |
|---|---|
| `npm run test:gateway` | 51 suites verdes, 568 pruebas verdes; 6 suites y 58 pruebas saltadas |
| `npm run test:gateway:coverage` | Cobertura 92,14% sentencias, 79,85% ramas, 92,99% funciones, 92,74% líneas; umbral 70% satisfecho |
| `npm run typecheck:gateway` | Exit 0 |
| `npm run lint:gateway` | Exit 0 |
| `node scripts/check-public-openapi-syntax.mjs` | Exit 0 |
| `node scripts/validate-public-openapi.mjs` | Exit 0; 8 operaciones, límite único de foto y sin secretos |
| `test/security/no-secret-leakage.spec.ts` (GW-062) | 1 suite, 9 pruebas verdes |
| `test/integration/gateway-compose.spec.ts` (GW-063) | 1 suite, 10 pruebas verdes |

Las **6 suites saltadas** son las que exigen dependencias externas o Redis real:
`register.contract`, `session.contract`, `gateway-auth` (GW-058),
`gateway-users` (GW-059), `identity.e2e` (GW-060) y la suite de rate limit
sobre Redis. Se saltan de forma explícita (`describe.skip`) cuando faltan
`GATEWAY_AUTH_E2E_BASE_URL`, `GATEWAY_USERS_E2E_BASE_URL` o
`GATEWAY_TEST_REDIS_URL`; no se presentan como verdes. En CI el job
`gateway-quality` provee Redis, por lo que las suites de contrato sí se ejercen
allí.

## Evidencia de seguridad y runtime

- **GW-062 (auditoría de fuga de secretos):** el Gateway real, por HTTPS y con
  stubs locales de Auth/Users, no expone contraseña, hash, refresh token, service
  JWT, foto ni cabeceras internas en respuestas, logs JSON, registros OTLP ni
  trazas OTel. `/auth/validate` responde solo `userId`/`sessionId`/`role`.
- **GW-063 (runtime):** se auditan los artefactos versionados, no un
  `compose up` real. El Dockerfile es multi-stage, usa `npm ci`, compila el
  workspace, corre como usuario no root, expone solo 8080 y declara healthcheck
  HTTPS. `docker-compose.yml` define `api-gateway` con `target: runtime`,
  `restart: always`, redes internas, secretos TLS/Redis/service JWT, publicación
  únicamente de `8080:8080` y dependencias sanas de Redis, Auth y Users. El Redis
  de borde no publica puertos y exige contraseña.
- **GW-062/GW-063 no requieren** Auth/Users reales ni un daemon Docker; por eso
  sí producen evidencia ejecutada.

## Infraestructura reparada en esta continuación

- `.github/workflows/ci.yml`: se eliminaron los marcadores de conflicto que el
  merge remoto había dejado versionados y se restauró el job `gateway-quality`
  (lint, typecheck, cobertura, OpenAPI, build y Docker build).
- `docker-compose.yml`: se restauró el servicio `api-gateway` y la red
  `stayhub-edge`, que el merge había perdido.
- `package.json`: se añadieron `test:gateway:coverage`, `openapi:check:gateway`
  y `test:auth:coverage`.
- `.github/workflows/ci.yml`: se añadió el job k6 `gateway-performance`,
  condicionado a `vars.GATEWAY_PERF_BASE_URL` para no inventar resultados.

## Pendientes externos de G1

| Tarea | Estado | Motivo |
|---|---|---|
| GW-058 (Auth G3 real) | BLOQUEADA | Requiere `GATEWAY_AUTH_E2E_BASE_URL` apuntando a Auth real; sin él la suite se salta |
| GW-059 (Users G2 real) | BLOQUEADA | Requiere `GATEWAY_USERS_E2E_BASE_URL` y bearer real; sin ellos la suite se salta |
| GW-060 (E2E HTTPS G1↔G2↔G3) | BLOQUEADA | Depende de GW-058 y GW-059 con ambos servicios reales |
| GW-061 (k6) | BLOQUEADA | k6 no está instalado y no hay servicios reales; el job de CI queda condicionado a `GATEWAY_PERF_BASE_URL` |
| GW-063 verificación con `compose up` | PARCIAL | Docker daemon no disponible en esta máquina; la auditoría estática de artefactos sí se ejecutó |

No se marcan GW-058–GW-061 como completadas: no existe evidencia de integración
real ni de rendimiento, y el propio backlog prohíbe anticiparla. GW-062, GW-063
(artefactos) y GW-064 quedan cerradas con la evidencia local arriba descrita.

---

# Validación — Grupo 3: auth-service

## Procedencia de la evidencia

Rama `front-apigateway` con cambios de Auth **sin commitear**. Toda la evidencia
de esta sección fue **ejecutada localmente el 2026-11-10** en Windows. No acredita
una ejecución remota de GitHub Actions, ni integración real con G1/G2, ni un
`compose up` de esta ronda.

## Entorno aislado utilizado

| Recurso | Configuración |
|---|---|
| PostgreSQL | 17.11 temporal en `127.0.0.1:55432`, base `auth_test`, usuario `auth_test` |
| Migraciones | `001_auth_registration`, `002_auth_sessions`, `003_registration_work`, `004_session_revocation` aplicadas con `prisma migrate deploy` |
| Redis | Memurai en `127.0.0.1:6379`, base 15 |
| Variables | `TEST_AUTH_DATABASE_URL`, `TEST_AUTH_REDIS_URL`, `AUTH_TEST_ALLOW_CLEANUP=true` |

El guard de limpieza siguió exigiendo sufijo `_test` en la base y Redis DB 15; la
variable `AUTH_TEST_ALLOW_CLEANUP` solo se habilita en el job aislado de CI y en
esta ejecución local.

## Correcciones realizadas en esta continuación

| Archivo | Cambio |
|---|---|
| `.github/workflows/ci.yml` | `AUTH_TEST_ALLOW_CLEANUP: 'true'` a nivel del job `auth-quality`; el guard del harness conserva la validación de base `_test` y Redis DB 15 |
| `apps/auth-service/src/interfaces/http/dto/problem.response.ts` | `Problem.errors` como `FieldError[]` (`field`, `code`, `message?`) y `type` con `format: uri-reference`, alineado al contrato congelado |
| `apps/auth-service/src/interfaces/http/problem.mapper.ts`, `validation.pipe.ts`, `registration.controller.ts` | Emisión runtime de `FieldError` y de la clave `field` en validación e idempotencia |
| `apps/auth-service/test/integration/dependencies.setup.ts` | En Windows se ejecuta `npx.cmd` con `shell: true`; evita `EINVAL` al aplicar migraciones en el harness |
| `apps/auth-service/test/unit/dev-env-generator.spec.ts` | Las aserciones de bits POSIX (`0o600`) se omiten en Windows, que solo emula el bit de solo lectura; el resto de la prueba sigue ejecutándose |
| `apps/auth-service/test/security/no-secret-leakage.spec.ts` y contratos | Ajustados a la forma `FieldError` sin debilitar la comprobación de ausencia de secretos |

## Resultados ejecutados

| Comando / control | Resultado real |
|---|---|
| `npm run typecheck:auth` | Exit 0 |
| `npm run lint:auth` | Exit 0 |
| `npm run openapi:auth:check` | Exit 0; 11/11 comprobaciones de drift |
| `npx jest --coverage --runInBand` (con el entorno de la tabla) | **40 suites verdes, 454 pruebas verdes**, 0 fallos |
| Cobertura global | Sentencias **88,85%**; ramas **73,81%**; funciones **88,72%**; líneas **90,10%**; umbral 70% satisfecho en las cuatro métricas |
| Suites de integración aisladas | 11 suites y 100 pruebas verdes en la ejecución previa con el mismo entorno |

Las suites `cross-service-*`, `gateway-*`, `auth-compose` y `auth-users-smoke`
quedan excluidas por configuración de los proyectos por defecto: requieren G1/G2
reales o Compose y se tratan en los pendientes externos, no como verdes.

## Trazabilidad RQ-02 / FR-001–FR-013

| Área | Evidencia principal |
|---|---|
| Registro idempotente y saga (RQ-02, FR-001–FR-006) | `test/contract/registration.contract.spec.ts`, `test/unit/registration-*.spec.ts`, `test/integration/registration-{concurrency,saga,reconciler,work,module}.spec.ts`, `test/security/registration-secrets.spec.ts` |
| Login sin enumeración y rate limit (FR-007–FR-008) | `test/contract/login.contract.spec.ts`, `test/unit/login.use-case.spec.ts`, `test/unit/login-rate-limiter.spec.ts`, `test/integration/login-{rate-limit,persistence}.spec.ts` |
| JWT/sesión/refresh/validación (FR-009–FR-013) | `test/contract/{refresh,session-validation}.contract.spec.ts`, `test/unit/{access-token,session,issue-session-tokens,rotate-refresh-token.use-case,validate-session.use-case}.spec.ts`, `test/integration/{refresh-rotation,session-validation,session-unit-of-work}.spec.ts` |
| Guards y autorización (FR-011–FR-013) | `test/security/authentication-authorization.spec.ts`, `test/security/service-trust.spec.ts` |
| Redacción de secretos (FR-024) | `test/security/no-secret-leakage.spec.ts`, `test/security/registration-secrets.spec.ts` |
| Contrato interno (RQ-02, FR-001–FR-013) | `test/contract/openapi-drift.spec.ts`, `scripts/validate-auth-openapi.mjs` |

## Pendientes externos que permanecen abiertos

| Tarea | Estado | Motivo |
|---|---|---|
| AUTH-076 | COMPLETADA | 9 suites / 39 pruebas de `test:auth-users` verdes contra Users real (incluye timeout literal INT-14b). Ver «Sincronización Auth ↔ Gateway…» (2026-11-10) |
| AUTH-079 | PARCIAL | La saga y la reconciliación están acreditadas con procesos Node y bases en contenedor; falta Compose real con red accesible desde el host |
| AUTH-078 | COMPLETADA (provider local) | `test/contract/gateway.provider.spec.ts` verde contra el pacto GW-056 y códigos alineados; ver «Sincronización Auth ↔ Gateway» (2026-11-10) |
| AUTH-081 | COMPLETADA | Integración real Gateway↔Auth auto-hospedada: 3 pruebas verdes (flujo público, 401 y 429). Ver «AUTH-081 — integración G1↔Auth» |
| CI remota | NO EJECUTADA | Los cambios están sin commitear y no se hizo push; la corrección del job se validó localmente |

## Límites de esta evidencia

- No se reacredita retrospectivamente el orden red/green de las pruebas: la
  ejecución actual demuestra el estado verde, no el fallo previo a la implementación.
- `AUTH-082` (Compose) conserva la acreditación previa del backlog; no se repitió
  un `compose up` en esta ronda.
- La integración se ejecutó contra PostgreSQL 17 y Redis locales aislados, no
  contra el stack Compose completo ni con G1/G2 reales.
- El ajuste de `dev-env-generator.spec.ts` es exclusivamente de prueba: en Windows
  no es posible verificar bits de permiso POSIX, y el generador sigue aplicando
  `chmod 0o600` en plataformas que lo soportan.

---

# Sincronización Auth ↔ Gateway y timeout literal Auth↔Users (2026-11-10)

## Alineación de códigos Problem Details con el consumidor G1

Se alinearon los `code` que emite Auth con la expectativa congelada por el Gateway (GW-056/pact):

| Caso | Antes | Ahora |
|---|---|---|
| 400 validación | `VALIDATION_FAILED` | `VALIDATION_ERROR` |
| 401 service JWT | `HTTP_401` | `SERVICE_UNAUTHORIZED` |
| 401 refresh | `REFRESH_TOKEN_INVALID` | `REFRESH_REJECTED` |
| 409 registro | `REGISTRATION_CONFLICT` | `EMAIL_ALREADY_REGISTERED` |
| 429 login | `LOGIN_RATE_LIMITED` | `RATE_LIMITED` |

`INVALID_CREDENTIALS`, `SESSION_INVALID`, `DEPENDENCY_UNAVAILABLE`, `IDEMPOTENCY_CONFLICT` y
`REGISTRATION_CANCELLED` no cambian.

## AUTH-078 — provider contra el pacto GW-056

- `apps/auth-service/test/contract/gateway.provider.spec.ts`: 18 pruebas verdes sobre las cuatro
  operaciones internas, statuses 200/201/400/401/409/429/503, `Problem` + `traceId`, service JWT,
  `Idempotency-Key` y `Retry-After`. Corre en `test:contract` (retirado de `crossServicePatterns`).
- Comandos ejecutados desde la raíz:
  - `npm run test:auth:contract` → exit 0, 8 suites / 160 pruebas.
  - `npm run test:auth:security` → exit 0, 4 suites / 66 pruebas.
  - `npm run openapi:auth:check` → exit 0, 11 comprobaciones.
  - `npm run test:contract -w @stayhub/api-gateway` → exit 0, 11 suites (2 skipped).

## AUTH-081 — integración G1↔Auth

- `apps/auth-service/test/integration/gateway-auth.spec.ts`: variante externa aislada por entorno
  (`CROSS_SERVICE_PROVIDERS=true` + `CROSS_SERVICE_GATEWAY_URL`) para stacks ya desplegados.
- `apps/auth-service/test/integration/gateway-auth-selfhosted.spec.ts`: variante auto-hospedada que
  levanta Auth+Users reales (harness), un Redis de borde y el API Gateway real (`dist`) y ejecuta
  registro→login→validate→refresh→logout, cookie `HttpOnly`/`SameSite=Strict`/path, rotación, 401 y 429.
- **Ejecutado** el 2026-11-10:
  `AUTH_USERS_TEST_HOST_NETWORK=true AUTH_GATEWAY_E2E_SELF_HOSTED=true npx jest --config jest.auth-users.config.ts`
  → 3 pruebas verdes. El 503 fail-closed se cubre en GW-058.

## AUTH-076 / AUTH-079 — timeout literal Auth↔Users

- `users-fault-proxy.ts` incorpora el modo `hang`: reenvía a Users real y nunca responde, forzando
  el aborto del cliente por `AUTH_USERS_TIMEOUT_MS`.
- `cross-service-recovery.spec.ts` añade INT-14b con `AUTH_USERS_TIMEOUT_MS=1000`: dos timeouts
  idempotentes → 503 `DEPENDENCY_UNAVAILABLE`, identidad remota `PENDING`, estado reanudable y
  reintento con la misma `Idempotency-Key` que converge a `COMPLETED`.
- **Ejecutado** con `AUTH_USERS_TEST_HOST_NETWORK=true` (fallback para Docker rootless: los
  contenedores de PostgreSQL/Redis usan `--network host` y escuchan en un puerto libre del host,
  de modo que Prisma y los procesos `node dist` conectan por `127.0.0.1`). Resultado real:
  `npx jest --config jest.auth-users.config.ts --runInBand` → **9 suites / 39 pruebas verdes**,
  incluidas `cross-service-{registration,login,profile,recovery,reconciliation,restart}`,
  `users-registration.consumer`, `users-login-identity.consumer` y `auth-users-smoke`.
- `AUTH-079` sigue abierta solo por el requisito literal «en Compose»: la integración y el timeout
  están acreditados con el harness de procesos Node + contenedores, no con `docker-compose.yml`.

## Estado de tareas tras la sincronización

- `AUTH-078`: `[X]` (provider local ejecutado).
- `AUTH-076`: `[X]` (acreditada por las 9 suites Auth↔Users, incluido el timeout literal).
- `AUTH-081`: `[X]` (integración real Gateway↔Auth auto-hospedada, 3 pruebas verdes).
- `AUTH-079`: `[ ]` (solo falta el requisito literal «en Compose»).
- `specs/001-fundamentos-identidad/tasks.md`: bloque AUTH resincronizado con el sub-backlog
  (82/84 marcadas; antes 43/84).
