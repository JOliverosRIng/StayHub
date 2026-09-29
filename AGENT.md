# AGENT.md — StayHub

Contexto operativo para cualquier agente (o persona) que trabaje en este repositorio.
Leer **completo** antes de tocar código. No asumir que el estado de `main` refleja el estado real del proyecto.

---

## 1. Qué es StayHub

Plataforma de reservas de alojamientos y hoteles (modelo Airbnb) del curso de posgrado.
Microservicios NestJS 10 + TypeScript estricto, React 18 (cliente web, **fuera del alcance del Sprint 1**),
Docker Compose, PostgreSQL 16, Redis 7, RabbitMQ 3 (broker, **no usado en Sprint 1**).

- **Alcance de producto y requerimientos funcionales (fuente autoritativa):** `tendencias.md` → RQ-01 … RQ-13.
- **Gobernanza de diseño/verificación:** `.specify/memory/constitution.md` v1.0.0 (8 principios + quality gates).
- **Workflow:** Spec Kit (`specify → plan → tasks → implement`). Scripts en `.specify/scripts/powershell/`.
- **Cronograma aprobado:** 4 sprints, 01 sep → 28 nov 2026. 6 integrantes, 3 grupos de 2.

### Feature activa: `001-fundamentos-identidad` (Sprint 1)

Alcance: **solo backend**. RQ-01 (editar perfil) y RQ-02 (crear usuario con rol).
Tres aplicaciones:

| Grupo | Aplicación | Puerto | Responsabilidad | Ramas de trabajo |
|---|---|---|---|---|
| G1 | `apps/api-gateway` | **8080 HTTPS (público)** | Borde: routing, HTTPS, rate limit, introspección, proxy | *ninguna — no existe* |
| G2 | `apps/users-service` | 3002 (interno) | Identidad, correo, rol, perfil, foto, versión | `feat/users-perfil-authz` (usar esta) |
| G3 | `apps/auth-service` | 3001 (interno) | Credenciales, saga de registro, sesiones, JWT, refresh | `Auth_Service` (usar esta) |

**Fuera de alcance de Sprint 1:** frontend React, RabbitMQ, alojamientos, búsqueda, reservas,
pagos, reseñas, recuperación de contraseña, verificación de correo, MFA, aprovisionamiento de ADMIN.

---

## 2. Estado real del repositorio (leer antes de planear nada)

> **`main` está vacío de código.** Contiene solo `tendencias.md`, `.specify/`, `.agents/` y `specs/`.
> Todo el trabajo vive en ramas remotas que divergen entre sí desde `66d539c`.

```
main                     4 commits · 0 tareas de 226 marcadas · sin código
origin/feat/users-perfil-authz   27 commits · 174 archivos · USR-001..070 [x]  (~90% de G2)
origin/Users_Service             16 commits ·  91 archivos · USR-001..015 [x]  (rama anterior, obsoleta)
origin/Auth_Service               2 commits · 223 archivos · AUTH 44 de 84 [x] (código más avanzado que el backlog)
api-gateway                       AUSENTE en todas las ramas · 0 de 64 tareas
```

### Por qué esto importa

1. **Nunca asumas que `git status` limpio significa trabajo hecho.** Hay que leer las tres ramas.
2. **`package.json`, `package-lock.json`, `tsconfig.base.json`, `nest-cli.json`, `docker-compose.yml`,
   `.env.example`, `.github/workflows/ci.yml` están modificados de forma independiente en las 3 ramas.**
   Un merge automático no es posible; el conflicto hay que resolverlo a mano una sola vez, con un único
   diseño de raíz que contenga ambos workspaces.
3. **`origin/Users_Service` está abandonada.** No usarla; `feat/users-perfil-authz` la supera.
4. `api-gateway` es el camino crítico: sin él no existe E2E ni cierre de Auth ni de Users.

### Verificación recomendada antes de actuar

```powershell
git fetch --all --prune
git log --oneline origin/main -3
git rev-list --left-right --count origin/main...origin/feat/users-perfil-authz
git ls-tree -r --name-only origin/Auth_Service -- apps/auth-service/src | Measure-Object
```

---

## 3. Defectos de consistencia conocidos (resolver antes de integrar)

Estos son reales, verificados contra los archivos, y **bloquean la integración**. No inventar workarounds
silenciosos: cada uno requiere una decisión explícita del equipo.

| # | Defecto | Detalle | Acción requerida |
|---|---|---|---|
| **D1** | **Conflicto de puerto** | `specs/.../contracts/openapi-public.yaml` declara `servers: https://localhost:8443/api/v1`; `plan.md` §3/§7 y `tendencias.md` exigen **8080** | Decidir 8080, actualizar `servers:` **antes** de escribir el Gateway |
| **D2** | **Deriva del contrato Users** | Contrato congelado en `main` = 237 líneas; G2 lo reescribió a **868 líneas** en su rama. Mismos 8 paths, detalle muy distinto | Adoptar la versión de G2 (refleja el código real) y revisarla como consumidor |
| **D3** | **Deriva del contrato Auth** | G3 añadió `400`/`401`, `minLength: 32` al refresh, y amplió `Problem` | Fusionar manualmente con D4 |
| **D4** | **Dos definiciones de `Problem` incompatibles** | `openapi-public.yaml`: `required:[type,title,status,code,traceId]`, `errors: FieldError[]` · `openapi-auth-service.yaml` (rama G3): `required:[...,detail,instance,...]`, `errors: string[]` | **Unificar en un solo esquema** en los 3 contratos antes de codificar el Gateway |
| **D5** | **Redis de borde sin dueño** | `plan.md` §7 asigna Redis a G3 (Auth, para contadores) **y** a G1 (límites de registro/login). Solo existe `auth-redis` | Definir `gateway-redis` con credenciales y namespace separados, fail-closed |
| **D6** | **Compose divergente** | Redes/servicios con nombres distintos: `auth-internal` / `users-internal` / `internal` | Unificar red `stayhub-internal` + red de borde en el compose raíz |
| **D7** | **Node mismatch** | `engines: ">=20 <21"` pero Auth se verificó en Node 22.22.2 | Fijar Node 20 LTS en el entorno y CI; no dejar el warning flotando |
| **D8** | **Vulnerabilidades npm** | 38 avisos: 12 high (`@nestjs/platform-express`, `@nestjs/cli`, `prisma`, `lodash` vía swagger, `multer`) | Decidir: actualizar NestJS 10→12 / Prisma, o documentar excepción con dueño y fecha |
| **D9** | **Backlog de Auth desfasado** | `validation-report.md` afirma "Bloque 2 y 3 COMPLETOS" pero faltan `[x]` en `AUTH-040/041/045/065/067/068` (los use cases centrales) | Reconciliar backlog con el código real |
| **D10** | **Evidencia no versionada** | Ambos reportes enlazan `agents/AUTH-0xx/resultado.md`, que **no existe en el repo** (solo `.agents/skills/`) | Versionar la evidencia en `specs/001-fundamentos-identidad/evidence/` o retirar las referencias |
| **D11** | **Aliases muertos en Users** | `application/errors/users-errors.ts`, `registration-error.mapper.ts`, `profile-error.mapper.ts` son re-exports sin consumidores (0% cobertura) | Con el contrato `Problem` unificado, eliminar los alias o consumirlos; no escribir tests artificiales para cubrir re-exports |
| **D12** | **Sprint 1 vencido** | Sprint 1 = 01–21 sep 2026. Hoy es 29 sep: ya se está en el día 8 del Sprint 2 sin cerrar Sprint 1 | Replanificar el cronograma al aprobar el cierre de Sprint 1 |

---

## 4. Arquitectura y reglas que NO se negocian

### 4.1 Capas y dirección de dependencias (Constitución II)

```
domain/          ← no importa NADA de NestJS, Prisma, HTTP, Redis, PostgreSQL
application/     ← casos de uso, puertos (interfaces). Sin tipos Prisma.
infrastructure/  ← implementa los puertos. Prisma, HTTP, Redis, crypto, OTLP.
interfaces/      ← controladores, DTOs, guards, pipes, filters. Traducen, no deciden.
modules/         ← composición NestJS. Sin lógica de negocio.
```

Regla dura: **toda regla de negocio existe en un solo lugar autoritativo** (dominio). No duplicar
validaciones en controladores, DTOs ni servicios.

### 4.2 Aliases de ruta (tsconfig.base.json)

Ya definidos y en uso:

```jsonc
"@users/domain/*"       → apps/users-service/src/domain/*
"@users/application/*"  → apps/users-service/src/application/*
"@users/infrastructure/*" → apps/users-service/src/infrastructure/*
"@users/interfaces/*"   → apps/users-service/src/interfaces/*
"@users/modules/*"      → apps/users-service/src/modules/*

"@auth/domain/*" … "@auth/modules/*"  → apps/auth-service/src/*/*
```

Al crear el Gateway, seguir el mismo patrón: `@gateway/application/*`, `@gateway/infrastructure/*`,
`@gateway/interfaces/*`, `@gateway/modules/*`. El Gateway **no tiene `domain/`** (plan.md §3: no posee dominio).

### 4.3 Propiedad de datos (Constitución III) — inviolable

| Servicio / BD | Dueño de | Explícitamente NO posee |
|---|---|---|
| `users-service` / `users_db` | `User`, `emailNormalized`, `role`, `status`, perfil, foto, `version`, `registrationId` | hash de contraseña, sesiones, refresh tokens |
| `auth-service` / `auth_db` | `Credential`, `Registration`, `Session`, `RefreshToken`, claves RS256 | email, nombre, teléfono, preferencias, rol vigente, foto |

- **Cero FK entre bases. Cero consultas cruzadas a la otra BD.** El `userId` (UUID) viaja solo por contratos REST.
- Dos migraciones Prisma independientes, dos sets de índices, dos usuarios de BD.
- Nunca `prisma db push` en runtime: solo `prisma migrate deploy` como job previo al arranque.

### 4.4 Seguridad (Constitución V) — reglas exactas

- **Access token:** RS256, TTL **3600 s**, header `kid`, `alg` fijo con allowlist (rechazar `none`/HS256).
  Claims mínimos: `sub`, `sid`, `role`, `jti`, `iss`, `aud`, `iat`, `exp`. **Nunca** correo ni perfil.
- **Refresh token:** opaco, **un solo uso**, rotación en transacción con lock, expiración absoluta
  **7 días desde el login que nunca se extiende**. Replay de un token consumido → revoca la sesión completa.
- **Rol:** se fija al crear la sesión y es inmutable durante ella. Un cambio de rol futuro debe revocar
  las sesiones afectadas **antes** de aplicarse.
- **Service JWT:** credenciales **distintas** de los JWT de usuario, con `issuer`/`audience`/`scope`
  por llamador. `scopes`: `registration`, `lookup`.
- **Orden de precedencia:** `401` (token ausente/inválido/vencido) → `403` (autenticado sin permiso u
  ownership) → `400` (validación) → `404`/`409`/`413`/`415` → `429` → `503`.
- **Ownership:** `principal.sub == route.userId` se comprueba **antes** de tocar la BD, y devuelve `403`
  uniforme para cualquier identidad ajena **incluido `ADMIN`**, exista o no el recurso objetivo. Nunca
  revelar existencia por diferencia de respuesta.
- **Logging:** prohibido registrar contraseña, hash, JWT, refresh token, service JWT, correo, bytes de
  foto ni cabeceras internas. Sí se registra `traceId`.
- **Gateway:** es el **único** que expone puerto. Debe **borrar** toda cabecera de identidad/forwarding/
  service-auth que aporte el cliente antes de rutear, y propagar solo el bearer validado + `traceId`.
- **HTTPS:** solo en el Gateway (8080). No existe listener HTTP público alternativo.
- **Origen de red para rate limit:** IP del socket. Aceptar `X-Forwarded-For` **solo** si el proxy
  inmediato está en la allowlist configurada.

### 4.5 Contrato de errores — unificar según D4

Todos los servicios usan **Problem Details** (`application/problem+json`) con:
`type`, `title`, `status`, `detail`, `instance`, `code`, `traceId`, `errors[]`.
Los `code` son estables y distintos entre sí — en particular `EMAIL_CONFLICT` y `VERSION_CONFLICT`
deben ser distinguibles (409) sin revelar estado interno.
En Users el mapeo real ocurre en `interfaces/http/problem.filter.ts` → `interfaces/http/problem.mapper.ts`.

### 4.6 Límites antiabuso (valores cerrados, del `spec.md`)

| Límite | Ventana | Dónde vive | Fallo de Redis |
|---|---|---|---|
| Registro: 10 por origen de red | 10 min | **Gateway** (borde) | `503` fail-closed |
| Login: 30 intentos por origen | 5 min | **Gateway** (borde) | `503` fail-closed |
| Login: 5 fallos por identificador normalizado (HMAC) | 15 min | **Auth** | `503` fail-closed |

Al exceder: `429` + `Retry-After`. Un login correcto limpia el contador del identificador.
Las ventanas expiran solas. Nunca revelar si la cuenta existe.

### 4.7 Validaciones de entrada (exactas, no negociables)

- `name`: 2–100 caracteres **después de trim**.
- `email`: formato válido, máx 254, unicidad por `trim().toLowerCase()` (índice único es la autoridad final).
- `password` (registro): **8–128 caracteres, evaluada exactamente como llega** — sin trim, sin case-folding,
  sin normalización Unicode. Hash Argon2id.
- `phone`: opcional, E.164 (`^\+[1-9][0-9]{7,14}$`).
- `preferences`: opcional, objeto de **máximo 20** pares, valores escalares.
- `photo`: opcional, **JPEG o PNG** verificado por *magic bytes* (no por el MIME declarado),
  **máximo 5.000.000 bytes (5 MB decimal, NO 5 MiB = 5.242.880)**. El filename se descarta; se guarda SHA-256.
- `role` público: solo `GUEST` u `OWNER`. `ADMIN` se reconoce pero **no se puede requesting por registro**.
- Semántica de `null`: limpia `phone`, `preferences` o `photo`. **Rechazado** para `name` y `email`.
  Campo omitido = conserva valor.
- **Cualquier campo desconocido o restringido** (`role`, `id`, `status`, `registrationId`, `credential`,
  override de `version`) → `400` y **cero cambios**.
- Toda actualización de perfil es **todo-o-nada** en una transacción con `expectedVersion`;
  conflicto de versión o de email → `409` sin cambios parciales.

### 4.8 Comunicación

- Sprint 1 es **100% REST síncrono**. No crear eventos sin consumidor. No introducir RabbitMQ.
- Toda llamada entre servicios: **timeout + circuit breaker** + reintentos **solo** en operaciones
  idempotentes o protegidas por `Idempotency-Key`.
- Timeout o caída de una dependencia autoritativa → `503`, **cero mutaciones confirmadas**.

### 4.9 Saga de registro (Auth es el dueño, nunca el Gateway ni Users)

```
STARTED → USER_PENDING → CREDENTIAL_PENDING → CREDENTIAL_ACTIVE → COMPLETED
   cualquier estado no completo → COMPENSATING → CANCELLED
```

- `Idempotency-Key` (UUID) es la PK de `Registration`. Fingerprint HMAC canónico del request —
  **nunca incluye la contraseña cruda**. Misma clave + payload distinto → `409`.
- Reconciliador programado: **cada 30 s**, lote con `SELECT … FOR UPDATE SKIP LOCKED`,
  **máx 5 intentos** con backoff, TTL de registro `PENDING` **15 min**.
- La compensación **nunca** elimina una identidad ya expuesta: solo opera sobre estados internos no
  autenticables. Solo `ACTIVE` es visible o autenticable.
- Intervalo, TTL, tamaño de lote e intentos son **configuración validada** (no constantes hardcodeadas),
  para que las pruebas puedan acelerarlos.

---

## 5. Contratos OpenAPI — propiedad y reglas

| Archivo | Owner | Reviewers |
|---|---|---|
| `specs/001-fundamentos-identidad/contracts/openapi-public.yaml` | **G1** | G2, G3 |
| `…/openapi-auth-service.yaml` | **G3** | G1 |
| `…/openapi-users-service.yaml` | **G2** | G1, G3 |

- Cada cambio incompatible se integra **solo** cuando se actualizan en el mismo corte:
  productor + consumidores + prueba de contrato + OpenAPI.
- Detección de drift obligatoria: `scripts/validate-*-openapi.mjs` (ya existen para users y auth;
  falta el del público, ver `GW-055`).
- UI de Swagger: **solo en desarrollo**.

### Rutas públicas (Gateway, `/api/v1`)

```
POST   /auth/register                 Idempotency-Key: <uuid>   201/400/409/429/503
POST   /auth/login                                                   200/400/401/429/503 + Set-Cookie
POST   /auth/refresh                  cookie stayhub_refresh      200/401/503
GET    /auth/validate                                                200/401/503
GET    /users/{userId}/profile                                        200/401/403/404/503
PATCH  /users/{userId}/profile          multipart/form-data        200/400/401/403/409/413/415/503
GET    /users/{userId}/profile/photo                                 200/401/403/404 + ETag
```

### Rutas internas (con service JWT)

```
Auth:   POST /internal/v1/registrations
        POST /internal/v1/login
        POST /internal/v1/sessions/refresh      (sin cookie: el token va en el body)
        POST /internal/v1/sessions/validate
Users:  POST /internal/v1/registrations
        POST /internal/v1/registrations/{registrationId}/activate   200
        POST /internal/v1/registrations/{registrationId}/cancel     204
        POST /internal/v1/login-identities/resolve                  200  → {userId, role, status}
        GET|PATCH /internal/v1/users/{userId}/profile
        GET      /internal/v1/users/{userId}/profile/photo
Ambos:  GET /health/live   GET /health/ready
```

`GET /internal/v1/registrations/{registrationId}` es **necesario** para la reconciliación y aparece
en el reporte de Auth; verificar que exista en el contrato de Users (ver D2).

---

## 6. Convenciones de código (seguir lo ya escrito, no inventar)

- **Workspaces npm** `@stayhub/<service>-service`. El workspace raíz declara `apps/*`.
- **NestJS 10.4.22**, TypeScript 5.7.3 con `strict`, `noUncheckedIndexedAccess`,
  `exactOptionalPropertyTypes`, `noImplicitOverride`.
- **Prisma 6.19.0** únicamente. TypeORM **no** se usa (decidido en `plan.md` §1).
- **Nombres de archivo en kebab-case**: `profile.controller.ts`, `resolve-login-identity.use-case.ts`,
  `profile-error.mapper.ts`, `service-jwt.verifier.ts`.
- **Interfaces de casos de uso** en `application/ports/*.port.ts`; repositorios en
  `application/ports/*.repository.ts`. Sin tipos Prisma en dominio o aplicación.
- **Errores de dominio** en `domain/shared/domain-error.ts`; errores de aplicación en
  `application/errors/*-errors.ts`. **El mapeo HTTP vive fuera del dominio.**
- **DTOs cerrados** siempre: `ValidationPipe` con `whitelist` + rechazo explícito de campos desconocidos.
- Variables de entorno con prefijo de servicio: `USERS_*`, `AUTH_*`, y **`GATEWAY_*`** (a definir).
  Los secretos se referencian por `*_FILE` cuando es posible. **Nunca** versionar secretos ni certificados;
  `.env.example` solo contiene nombres y ejemplos no sensibles.
- `.gitignore` debe cubrir `node_modules/`, `dist/`, `coverage/`, `.artifacts/`, `.env`.
- **Node 20 LTS.** Resolver D7 antes de confiar en cualquier build.

### Comandos por servicio

```powershell
# raíz (scripts con espacio de nombres — ver D-nota de merge)
npm run build:users ; npm run lint:users ; npm run typecheck:users
npm run test:users -- --coverage
npm run build:auth  ; npm run lint:auth  ; npm run typecheck:auth
npm run test:auth -- --coverage

# dentro de apps/<service>
npm run build | lint | typecheck
npm run test:unit | test:integration | test:contract | test:security
npm run test:coverage
npm run prisma:generate | prisma:migrate:dev | prisma:migrate:deploy

# Auth además
npm run test:cross-service      # requiere Compose/Podman levantado
npm run openapi:check           # sintaxis + drift
```

### Pruebas

- Proyectos Jest separados: `unit`, `integration`, `contract`, `security` (Auth añade `cross-service`).
- **Las pruebas se escriben ANTES del comportamiento** y deben fallar por la razón esperada.
  Si pasan sin que exista el código, la prueba está mal.
- Suites de integración usan **PostgreSQL 16 real** (harness con esquemas aislados + migraciones reales).
  **Prohibido mockear persistencia** en suites `integration`.
- Cobertura mínima **70%** en las 4 métricas del código afectado (`coverageThreshold.global` en
  `apps/*/jest.config.ts`). La cobertura no sustituye pruebas de comportamiento.
- k6 versionado para rendimiento: HTTPS sobre Compose, 100 usuarios `ACTIVE`, warm-up 30 s,
  2 escenarios de 25 req/s × 2 min, **p95 < 500 ms** y errores inesperados **< 1%**.

---

## 7. Definition of Done (aplicar sin excepción)

Una tarea solo está completa si:

1. El código está en `main` y pasa CI. *(hoy: 0 de 3 servicios cumplen esto)*
2. Pruebas unitarias con cobertura ≥ 70% del código afectado, **más** suites de comportamiento,
   integración, seguridad y concurrencia.
3. La API está documentada con OpenAPI y **sin drift** respecto al comportamiento real.
4. El servicio corre en Docker sin errores; el frontend compila sin warnings críticos.
5. **Code review de al menos otro miembro del equipo.**
6. Los criterios de aceptación del requerimiento asociado se cumplen.
7. Trazabilidad explícita: RQ → FR → contrato → prueba, registrada en
   `specs/001-fundamentos-identidad/validation-report.md`.
8. Revisión de cumplimiento constitucional por un integrante **distinto** del que hizo el cambio
   (obligatoria mientras siga pendiente).

**Prohibido** declarar evidencia no ejecutada. Si una integración depende de otro grupo y ese
proveedor no existe, la tarea queda **BLOQUEADA**, no verde. Es exactamente lo que hacen
correctamente los reportes actuales de G2 y G3 — mantener esa honestidad.

---

## 8. Orden de trabajo recomendado

1. **Consolidación** — resolver D1 y D4 primero (bloquean todo lo demás), crear rama de integración,
   unificar raíz (`package.json` con ambos workspaces, compose con las 7 piezas, CI en jobs por servicio,
   un solo `tsconfig.base.json` y un solo lockfile), adoptar contratos de G2/G3 (D2, D3), versionar
   evidencia (D10), reconciliar backlog de Auth (D9).
2. **`api-gateway`** (G1, 64 tareas, 0% hecho) — es el camino crítico. Setup → fundamentos
   (config fail-fast, TLS 8080, Problem Details, logger con redacción, trusted-origin, Redis borde,
   service JWT, Passport, header stripping, cliente REST, health, Swagger) → US1 registro → US2
   sesión (cookie + introspección) → US3/US4 perfil (streaming, límite 5.000.000, ownership guard) →
   integración y cierre.
3. **Cierre de Auth** — `AUTH-076…081` (integraciones reales), `AUTH-084`.
4. **Cierre de Users** — `USR-071…078`, resolver D8 (vulnerabilidades) y D11 (aliases muertos).
5. **Verificación conjunta** — `docker compose up` completo, E2E
   `registro → login → perfil → cambio de correo → refresh` + negativos + concurrencia + replay,
   k6, auditoría de secretos, `validation-report.md` consolidado.
6. **Replanificar cronograma** (D12) con las fechas reales.

---

## 9. Errores frecuentes a evitar

| Error | Por qué falla |
|---|---|
| Asumir que `main` tiene el código | `main` está vacío; todo está en 3 ramas divergentes |
| Mergear las ramas a ciegas | Los 7 archivos raíz se modificaron en las 3; conflicto manual obligatorio |
| Usar `origin/Users_Service` | Está abandonada; `feat/users-perfil-authz` la supera |
| Escribir el Gateway sin resolver D1 | Arranca en el puerto equivocado y falla el contrato |
| Definir `Problem` distinto en cada servicio | Rompe la semántica común de errores (D4) |
| Poner 5 MiB (5.242.880) en vez de 5.000.000 | El spec y las pruebas existing usan **5 MB decimales** |
| Confiar en el `Content-Type` para validar la foto | Hay que verificar **magic bytes** |
| Aceptar `role: ADMIN` en el registro público | Prohibido; `ADMIN` solo preaprovisionado (fuera de alcance) |
| Confiar en cabeceras de identidad del cliente | El Gateway debe **borrarlas** antes de rutear |
| Devolver `404` vs `403` distinto según exista el recurso | Filtra existencia de datos; el ownership va **antes** del lookup |
| `prisma db push` en runtime | Solo `prisma migrate deploy` como job previo |
| Retries en operaciones no idempotentes | Puede duplicar registros/reservas; usar `Idempotency-Key` |
| Marcar `[x]` sin ejecutar la prueba | El DoD exige cobertura ≥70% **y** code review; no negociable |
| Escribir tests artificiales para cubrir re-exports | Inflar la cobertura no es evidencia (ver D11) |
| Introducir RabbitMQ en Sprint 1 | El plan §2 lo pospone explícitamente |

---

## 10. Referencias de archivos

| Ruta | Contenido |
|---|---|
| `tendencias.md` | Fuente autoritativa de producto: RQ-01…RQ-13, sprints, DoD |
| `.specify/memory/constitution.md` | 8 principios + quality gates + gobernanza |
| `specs/001-fundamentos-identidad/spec.md` | 4 user stories, 24 FR, 9 BR, 7 SC, límites antiabuso |
| `specs/001-fundamentos-identidad/plan.md` | Plan técnico, responsabilidades G1/G2/G3, integración |
| `specs/001-fundamentos-identidad/data-model.md` | Modelos de ambas BD, invariantes, rotación de refresh |
| `specs/001-fundamentos-identidad/tasks.md` | Backlog compilado (226 tareas) |
| `specs/001-fundamentos-identidad/tasks/tasks_apigateway.md` | GW-001…064 (empezar por aquí) |
| `specs/001-fundamentos-identidad/tasks/tasks_userService.md` | USR-001…078 |
| `specs/001-fundamentos-identidad/tasks/tasks_authService.md` | AUTH-001…084 |
| `specs/001-fundamentos-identidad/contracts/` | Los 3 OpenAPI (ver D2–D4) |
| `specs/001-fundamentos-identidad/validation-report.md` | Evidencia por servicio (no existe en `main`) |
| `users-service-status.md` (rama G2) | Bitácora detallada del estado de Users |
