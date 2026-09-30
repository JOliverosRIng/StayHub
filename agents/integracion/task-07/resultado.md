# Task 07 — Recuperación, fallos y reinicios — Resultado

Estado: COMPLETA

Fecha: 2026-09-30
Commit base: `08968e8` (rama `main`). Sin commits ni push.
Versiones usadas: Node `v22.22.2`, npm `10.9.7` (el proyecto declara Node 20; solo warnings de
engines). `podman` 5.8.7; `postgres:16-alpine`, `redis:7-alpine`. Sin secretos en este informe.

## 1. Dependencias leídas y estado comprobado

- `CONTEXTO.md`, índice, `task-07/PLAN.md`, `task-05/resultado.md` y `task-06/resultado.md`
  (ambas COMPLETA en el índice). Se extienden el harness de task-05 y los flujos de task-06; no
  se creó un segundo harness.
- Código revisado: `users-service.client.ts` (reintento, circuit breaker),
  `users-registration.client.ts`, `advance-registration.service.ts`,
  `reconcile-registrations.use-case.ts`, `registration.repository.ts` (claim/lease),
  `registration-reconciler.service.ts` y `auth-config.ts`.

## 2. Archivos cambiados y decisiones

Código productivo (corrección acotada, demostrada por prueba):

1. `apps/auth-service/src/application/registration/reconcile-registrations.use-case.ts`,
   `compensate()`: si `cancel` falla por una causa que no es conflicto, se consulta el GET de
   registro. Solo un **404 autenticado** (`getRegistration` → `null`) se trata como ausencia
   confirmada: se revoca la credencial si existiera y el registro pasa a `CANCELLED`. Si el GET da
   401, 403, 5xx o error de red (`unavailable`), o si la identidad existe, el registro sigue en
   `COMPENSATING` y se reintenta. El caso 409 → ACTIVE → `COMPLETED` no cambia. No hubo cambios de
   puerto, cliente ni protocolo.

Configuración de build (defecto de task-05 encontrado al recompilar):

2. `apps/auth-service/tsconfig.build.json`: excluye `jest.auth-users.config.ts`. Task-05 lo añadió
   a `tsconfig.json`, que `tsconfig.build.json` hereda, y `nest build auth-service` fallaba con
   TS6059 (rootDir). Esa build fallida emitió `jest.config.{js,d.ts,js.map}` y
   `jest.auth-users.config.{js,d.ts,js.map}` en `apps/auth-service/`, y esos archivos rompían Jest
   ("Multiple configurations found"). Los seis artefactos eran de esta sesión y se eliminaron.

Pruebas y harness:

3. `test/helpers/users-fault-proxy.ts` (nuevo): proxy HTTP entre Auth y Users real. Tiene dos
   modos: `drop-response`, que reenvía, espera la respuesta completa de Users y corta la conexión
   con Auth, y `refuse`, que corta sin reenviar. Cada regla afecta a N peticiones que coinciden en
   método y ruta, y registra los hits con el estado real de Users. No fabrica respuestas.
4. `test/helpers/auth-users-harness.ts` (ampliado):
   - `provisionAuthUsersHarness({ authEnv, usersFaultProxy })`.
   - `faults`, `stopUsers/startUsers`, `stopAuth/startAuth`, `restartInfrastructure()` (reinicia
     los PostgreSQL y Redis del harness) y `recentLogs()`.
   - Sin opciones se comporta igual que antes.
5. `test/helpers/auth-users-flows.ts`: `waitFor`, `sleep`, estados por `registrationId` en ambas
   bases y `activeUsersWithoutUsableCredential()`, el invariante cruzado calculado desde las
   pruebas.
6. Suites nuevas, añadidas a `jest.auth-users.config.ts` y excluidas del Jest ordinario en
   `jest.config.ts`:
   - `test/integration/cross-service-recovery.spec.ts` (INT-13, INT-14). Reconciliador a 3600 s,
     para que la convergencia observada sea la del reintento del cliente.
   - `test/integration/cross-service-reconciliation.spec.ts` (INT-15). Reconciliador real a 1 s y
     `AUTH_USERS_CIRCUIT_RESET_MS=1000`, solo en esta suite. El TTL se vence poniendo `expiresAt`
     en el pasado en la base desechable, y solo cuando la fila no tiene `processingOwner`, para no
     competir con un worker que persiste el snapshot completo.
   - `test/integration/cross-service-restart.spec.ts` (INT-17).
7. `test/integration/registration-reconciler.spec.ts` (suite aislada existente, con doble de
   Users): dos regresiones nuevas. `COMPENSATING` sin identidad remota pasa a `CANCELLED`. Si el
   GET de confirmación da 503, el registro sigue en `COMPENSATING` y se cierra en el tick
   siguiente.

## 3. Pérdidas de respuesta y límites de reintento

- En `UsersServiceClient`, las peticiones idempotentes (todas las de registro y lookup) hacen
  **2 intentos**. Solo reintentan ante 5xx o error de red; los 4xx se propagan sin reintentar.
  Cada petición fallida suma 1 al circuit breaker, que se abre con 5 fallos durante 30 s (1 s solo
  en la suite de reconciliación).
- Por eso el proxy descarta exactamente **1** respuesta para acreditar el reintento interno (la
  petición termina en 201) y **2** para agotar la petición y observar la recuperación posterior
  (reintento del cliente con la misma key, o reconciliador).

## 4. Comandos, códigos de salida y resultados reales

Reproducción del defecto con el código original: copia temporal del archivo de HEAD, build y
prueba; después se restauró el fix y se recompiló.

```text
✕ interrupted before creating the Users identity: waits within TTL, cancels after TTL (33762 ms)
  Expected: "CANCELLED"   Received: "COMPENSATING"
```

Regresión conjunta INT-01–17 con el fix:

```text
$ npm run test:auth-users                       # exit 0
PASS test/integration/cross-service-reconciliation.spec.ts
PASS test/integration/cross-service-recovery.spec.ts
PASS test/integration/cross-service-restart.spec.ts
PASS test/integration/cross-service-registration.spec.ts
PASS test/integration/cross-service-login.spec.ts
PASS test/integration/cross-service-profile.spec.ts
PASS test/integration/auth-users-smoke.spec.ts
PASS test/contract/users-registration.consumer.spec.ts
PASS test/contract/users-login-identity.consumer.spec.ts
Test Suites: 9 passed, 9 total
Tests:       38 passed, 38 total
Time:        218.771 s
```

No regresión:

```sh
npm run build:auth && npm run build:users   # exit 0 (antes del ajuste de tsconfig.build: TS6059)
npm run lint:auth                           # exit 0
npm run typecheck:auth                      # exit 0
npm run test:auth:unit                      # 146 tests, 0 fallos
npm run test:auth:contract                  # 142 tests, 0 fallos
npm run test:auth:security                  # 66 tests, 0 fallos
npm run test:auth:integration               # 11 suites, 100 tests, 0 fallos
```

`test:auth:integration` necesita `TEST_AUTH_DATABASE_URL`/`TEST_AUTH_REDIS_URL`. Se ejecutó
contra un PostgreSQL `auth_test` y un Redis DB 15 desechables creados para esta verificación, con
`AUTH_TEST_ALLOW_CLEANUP=true`, y ambos se eliminaron al terminar.

## 5. Escenarios acreditados (estados antes → después)

| ID | Prueba | Evidencia |
|---|---|---|
| INT-13 | `cross-service-recovery` › safe 503 while Users is down | Proceso Users detenido: registro 503 `DEPENDENCY_UNAVAILABLE` sin detalles internos; login de usuario existente 503 sin tokens. Auth `STARTED`, sin credencial, 0 filas Users. Users arrancado: el mismo key da 201, Users `ACTIVE` y login 200 |
| INT-13 | `cross-service-recovery` › unreachable at activation | `refuse`×2 en activate: 503. Users `PENDING`, Auth `CREDENTIAL_ACTIVE`, login 401 (registro parcial no confirmado). El reintento da 201, `COMPLETED`/`ACTIVE` y login 200 |
| INT-14 | `cross-service-recovery` › one lost create response | `drop-response`×1: hits `[drop,201]`, `[ok,201]`; respuesta 201; 1 fila Users `ACTIVE` |
| INT-14 | `cross-service-recovery` › two lost create responses | 503. Users `PENDING` (1 fila), Auth `STARTED`. El reintento con la misma key da 201 con el mismo `id`, 1 fila `ACTIVE` y login 200 |
| INT-14 | `cross-service-recovery` › two lost activate responses | Users devolvió 200 dos veces (commit) pero Auth respondió 503: Users `ACTIVE`, Auth `CREDENTIAL_ACTIVE`. El reintento da 201 y `COMPLETED`, credencial `ACTIVE`; nunca se canceló |
| INT-15 | `cross-service-reconciliation` › before creating the Users identity | `refuse`×2 en create: `STARTED`, sin fila en Users. 3 s de ticks dentro del TTL: sigue `STARTED`. Con el TTL vencido: `CANCELLED` (antes del fix, `COMPENSATING` indefinido). Reintento 409. Creación tardía directa en Users: queda `PENDING`, Auth sigue `CANCELLED`, reintento 409 y login 401 |
| INT-15 | › after create, before activation | `refuse`×2 en activate: el reconciliador, sin reintento del cliente, activa y completa; login 200 |
| INT-15 | › lost create responses + TTL vencido | Users `PENDING` → cancel 204 → Users `CANCELLED`, Auth `CANCELLED`; reintento 409; login 401 |
| INT-15 | › lost activate responses + TTL vencido | Users `ACTIVE` → Auth `COMPLETED` (nunca cancelado); credencial `ACTIVE`; login 200 |
| INT-15 | › Users unavailable during compensation | Users detenido con el TTL vencido: el registro no se cierra (`STARTED`/`COMPENSATING`). Users arrancado: `CANCELLED` |
| INT-17 | `cross-service-restart` | Registro OWNER y PATCH de perfil. Se paran Auth y Users, se reinician los PostgreSQL y Redis y se arrancan los procesos: readiness 200, login 200 con el mismo `userId`, perfil persistido (nombre y versión), replay del registro 201 con el mismo `id`, sesión previa válida y refresh previo rota en la misma sesión |
| Invariante | último test de recovery y de reconciliation | `activeUsersWithoutUsableCredential() == []`, y 0 registros no terminales al final de la suite de reconciliación |
| INT-01–12, 16 | suites de task-06 | Verdes en la misma ejecución conjunta |

Decisión sobre la carrera con una creación tardía: la ausencia solo se acepta con un 404 del GET
autenticado, y los errores 401/403/5xx/red siguen siendo fallos. Una creación tardía posterior
deja la identidad en `PENDING`: Auth no reanuda registros `CANCELLED` (el reintento con la key da
409 y `claimBatch` excluye los terminales), y el lookup de login solo resuelve identidades
`ACTIVE`. Nunca queda un usuario `ACTIVE` con credencial revocada.

Límite conocido, no bloqueante y sin protocolo nuevo: esa identidad `PENDING` huérfana reserva su
correo en Users. Liberarla requeriría un tombstone o una cancelación de identidades ausentes en
Users, que es un protocolo nuevo fuera de alcance. Es probable que solo ocurra si una petición
sigue en vuelo después de que venza su lease de 120 s, mientras que el cliente tarda como máximo
2 × 3 s.

## 6. Recursos temporales y limpieza

- Harness: por suite, 2 PostgreSQL, 1 Redis, 2 procesos Node y, cuando aplica, el proxy en
  proceso; todos se retiran en `dispose()`.
- Regresión ordinaria: `stayhub-task07-regression-*-pg/redis`, eliminados con `rm -f -v`.
- Artefactos `jest.*.js/.d.ts/.map` de la build fallida, eliminados.
- Estado final: 0 contenedores `stayhub-auth-users-test*`/`stayhub-task07*`; puerto 3002 libre.
  `.env` y `secrets/` solo se leyeron; los datos del desarrollador no se tocaron.

## 7. Instrucciones para task-08 (no ejecutada)

- Verificación final: `npm run build:auth`, `npm run build:users` (Auth ya compila de nuevo),
  `npm run test:auth-users` (9 suites y 38 tests; unos 4 min; requiere `.env`/`secrets/` de
  `npm run env:auth:dev`, podman o docker y el puerto 3002 libre) y las suites ordinarias de Auth y
  Users. Para `test:auth:integration`, exportar `TEST_AUTH_DATABASE_URL` (base terminada en
  `_test`), `TEST_AUTH_REDIS_URL` (DB 15) y `AUTH_TEST_ALLOW_CLEANUP=true`.
- El harness ejecuta `dist/`: recompilar tras cualquier cambio en `src/`, porque `ensureBuilt()`
  solo compila si falta `dist`.
- Documentar en README/docs: el comando `test:auth-users` y sus 9 suites, las opciones del harness
  (`usersFaultProxy`, `authEnv`, ciclo de vida), el cambio en `compensate()` (ausencia confirmada
  → `CANCELLED`) y el límite de la identidad `PENDING` huérfana ante una creación tardía.
- Fuera de alcance, sin cambios: Gateway, introspección de sesión en Users y rechazo en Users de
  JWT de sesiones revocadas.
