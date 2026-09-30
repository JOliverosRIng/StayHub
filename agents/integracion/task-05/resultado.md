# Task 05 — Harness de integración sin Gateway — Resultado

Estado: COMPLETA

Fecha: 2026-09-30
Commit base: `08968e8` (rama `main`). Sin commits ni push.
Versiones usadas: Node `v22.22.2`, npm `10.9.7` (host). El `engines` pide `>=20 <21`; se registra
la diferencia (solo warnings de npm). Engine de contenedores: **`podman` 5.8.7**. Imágenes usadas
`postgres:16-alpine` y `redis:7-alpine` (ya en caché). No se imprimieron secretos, claves ni tokens
en este informe.

## 1. Dependencias leídas y estado comprobado

- `agents/integracion/CONTEXTO.md`, el índice `PLAN.md` y `task-05/PLAN.md`.
- Resultados previos leídos: `task-01`–`task-04/resultado.md`; filas 01–04 en COMPLETA.
- **Dependencia task-04**: `Estado: COMPLETA`. Se reutiliza su contrato de arranque con Users real
  (Auth 3001/Users 3002, migraciones previas, sin stub) y la configuración persistente de
  `scripts/lib/dev-env.mjs` (task-02): `.env` y `secrets/` (B1), sin rotar claves.
- Estado real comprobado: no existía `jest.auth-users.config.ts`, ni el smoke, ni el script
  `test:auth-users`. `jest.config.ts` ya excluía de las suites aisladas varios patrones
  cross-service, pero no `cross-service-profile.spec.ts` ni `auth-users-smoke.spec.ts`.
  `test/helpers/cross-service-providers.ts` exige `CROSS_SERVICE_GATEWAY_URL` y **no** se usa.
- `dist/apps/auth-service/main.js` y `dist/apps/users-service/main.js` ya existían.
- `git status --short` inicial: cambios acumulados de task-01–04 y `agents/`, `guia/`, `guia-v2/`,
  `integracion.sh` sin rastrear. No se tocó nada ajeno a esta tarea.

## 2. Archivos cambiados y decisiones

Nuevos:

1. `apps/auth-service/jest.auth-users.config.ts` — configuración dedicada. `testMatch` explícito:
   el smoke y las cinco rutas previstas (`users-registration.consumer.spec.ts`,
   `users-login-identity.consumer.spec.ts`, `cross-service-registration.spec.ts`,
   `cross-service-login.spec.ts`, `cross-service-profile.spec.ts`). No depende del descubrimiento
   de Jest ni exige Gateway. Reutiliza el `alias` de `jest.config.ts`.
2. `apps/auth-service/test/auth-users/setup.ts` — solo sube el timeout de arranque a 900 s; no
   altera los timeouts HTTP productivos.
3. `apps/auth-service/test/helpers/auth-users-harness.ts` — harness reutilizable:
   - `loadDevEnvironment()` reutiliza `.env`/`secrets/` sin regenerarlos; si falta o no es
     coherente lanza error con la instrucción exacta (`npm run env:auth:dev`), en lugar de generar
     claves distintas que romperían B1.
   - Aprovisiona **dos PostgreSQL 16 desechables** (Auth `auth_test`, Users `users_db`) y **Redis**
     desechable en **DB 15**, en puertos libres y con nombres únicos
     `stayhub-auth-users-test-<pid>-<ts>-*`. Registra cada contenedor creado.
   - Aplica migraciones reales de ambos servicios; compila si falta `dist`.
   - Arranca `node dist` para Users y Auth como **procesos separados** (evita colisión de aliases
     Prisma y estrategias Passport) con la configuración persistente; solo sobrescribe URLs de
     base/Redis, `NODE_ENV=test`, `AUTH_TEST_ALLOW_CLEANUP=true`, `OTEL_*` local y
     `USERS_SERVICE_URL=http://127.0.0.1:3002`.
   - Firma el service JWT inbound con `secrets/gateway-private.pem` (kid/iss/aud/scope de `.env`);
     no hay Gateway ni stub.
   - Expone `authRequest`/`usersRequest` (fetch, timeout 10 s) y `dispose()` que termina los dos
     procesos y elimina **solo** los contenedores registrados, incluso ante fallo de arranque.
   - Falla explícitamente sin engine, sin `.env`/`secrets/`, si el puerto fijo `3002` está ocupado o
     si migraciones/readiness no llegan (incluye logs recientes).
4. `apps/auth-service/test/integration/auth-users-smoke.spec.ts` — smoke real: readiness de Auth y
   Users; registro por Auth (`Idempotency-Key` + bearer de servicio) y login del mismo usuario.
   Comprueba `201`, `id`/`userId` coincidentes y `accessToken` presente; no filtra la contraseña.

Modificados:

5. `apps/auth-service/jest.config.ts` — añade `auth-users-smoke.spec.ts` y
   `cross-service-profile.spec.ts` a `crossServicePatterns`, de modo que el Jest ordinario no las
   ejecute y el comando dedicado las enumere explícitamente.
6. `apps/auth-service/package.json` — script `test:auth-users`
   (`jest --config jest.auth-users.config.ts --runInBand`).
7. `package.json` (raíz) — script `test:auth-users` que delega en el workspace Auth.
8. `apps/auth-service/tsconfig.json` — incluye `jest.auth-users.config.ts` para el typecheck.
9. `apps/auth-service/README.md` — sección del harness: comando raíz, variables, aprovisionamiento
   aislado y limpieza.

Decisiones: las cinco rutas previstas se enumeran en la configuración pero **no** se crean en
task-05 (task-06/07 añadirán sus escenarios; no se crean suites vacías). Auth y Users reales como
procesos separados con DB/Redis en contenedores desechables. Se reutiliza la configuración
persistente; únicamente se sobrescriben destinos. La DB de Auth (`auth_test`) y Redis DB 15 siguen
el contrato de limpieza; no se renombró `users_db`.

## 3. Contrato del comando

```text
Comando raíz : npm run test:auth-users
Config       : apps/auth-service/jest.auth-users.config.ts
Setup        : test/auth-users/setup.ts (timeout 900 s)
Suites       : solo test/integration/auth-users-smoke.spec.ts existe hoy;
               las 5 rutas de task-06/07 están enumeradas y se ejecutarán al crearse.
Aislamiento  : PostgreSQL 16 desechables (auth_test + users_db) y Redis DB 15 en
               puertos libres; nombres de proyecto propios. No usa 55432/56379 ni
               el stack de desarrollo. Requiere el puerto 3002 libre.
Sin Gateway  : no usa CROSS_SERVICE_GATEWAY_URL; service JWT firmado por el harness.
Limpieza     : procesos Node + contenedores registrados; nunca recursos ajenos.
```

## 4. Comandos, códigos de salida y resultados reales

Smoke real (dos ejecuciones verdes consecutivas):

```text
$ npm run test:auth-users
PASS auth-users test/integration/auth-users-smoke.spec.ts (19.554 s)
  Auth<->Users smoke without Gateway (task-05)
    ✓ reports readiness for both real services
    ✓ registers a user through Auth and logs it in against real Users
Test Suites: 1 passed, 1 total
Tests:       2 passed, 2 total
```

Exclusión de las suites aisladas y enumeración dedicada:

```sh
cd apps/auth-service
npx jest --selectProjects integration --listTests | grep -c auth-users-smoke   # 0
npx jest --config jest.auth-users.config.ts --listTests
# -> solo test/integration/auth-users-smoke.spec.ts
```

Fallo explícito ante dependencia ausente (puerto fijo 3002 ocupado con un listener temporal):

```text
El puerto 3002 está ocupado (EADDRINUSE); libéralo o detén el stack de desarrollo
Test Suites: 1 failed, 1 total
Tests:       2 failed, 2 total
```

Verificaciones de no regresión:

```sh
npm run typecheck:auth      # exit 0
npm run lint:auth           # exit 0
npm run test:auth:unit      # 18 suites, 146 tests, 0 fallos
npm run test:auth:contract  # 7 suites, 142 tests, 0 fallos
```

Limpieza observada tras cada ejecución:

```text
podman ps -a | grep stayhub-auth-users-test   -> none
ss -ltn | grep ':3002'                        -> free
```

## 5. Escenarios acreditados y pendientes

Acreditados:

- Readiness real de Auth y Users (procesos `node dist`) por HTTP.
- Registro a través de Auth contra Users real (201) y login del mismo usuario (200) con
  `principal.userId == id` del registro y `accessToken` presente.
- Aislamiento: PostgreSQL desechables por servicio y Redis DB 15 en puertos libres; sin tocar
  55432/56379 ni el stack de desarrollo.
- Error explícito y ausencia de recursos si el puerto 3002 está ocupado; sin falsos verdes.
- Limpieza limitada a los recursos propios tras éxito y tras fallo.
- El smoke queda excluido del `test:integration` ordinario y se ejecuta por el comando dedicado.

Pendientes / fuera de alcance (no bloquean task-05):

- Suites de consumidor y cross-service (`*.consumer.spec.ts`, `cross-service-*.spec.ts`): task-06.
- Recuperación, fallos de dependencia y reinicios: task-07.
- Gateway e introspección de sesión: fuera de alcance global.
- La verificación se hizo con `podman`; no se ejecutó `docker` en este host.

## 6. Recursos temporales creados y limpieza

- En cada ejecución: 2 contenedores PostgreSQL, 1 Redis y 2 procesos Node, todos retirados por
  `dispose()`. No se crearon directorios ni archivos temporales.
- No se modificaron `.env` ni `secrets/` (solo lectura); sin rotación de claves.
- No se tocaron datos del desarrollador ni las bases de pruebas 55432/56379.
- La ejecución de fallo (puerto 3002 ocupado) no dejó contenedores ni procesos.

## 7. Instrucciones para task-06 (no ejecutada)

- Partir de `provisionAuthUsersHarness()` (`test/helpers/auth-users-harness.ts`) y del comando
  `npm run test:auth-users`; reutilizar `authRequest`/`usersRequest`/`serviceToken`.
- Crear las suites ya enumeradas en `jest.auth-users.config.ts`:
  `test/contract/users-registration.consumer.spec.ts`,
  `test/contract/users-login-identity.consumer.spec.ts`,
  `test/integration/cross-service-registration.spec.ts`,
  `test/integration/cross-service-login.spec.ts`,
  `test/integration/cross-service-profile.spec.ts`.
- No exigir `CROSS_SERVICE_GATEWAY_URL`; el service JWT lo firma el harness.
- Aislamiento: no reutilizar `stayhub-auth-dev` ni `stayhub-auth-users-dev`, ni las bases
  55432/56379; el harness ya aprovisiona recursos desechables y limpia solo los suyos.
- Mantener `apps/auth-service/jest.config.ts` excluyendo estas suites del Jest ordinario.
