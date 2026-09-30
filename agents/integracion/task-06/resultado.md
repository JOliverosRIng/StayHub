# Task 06 — Contratos y flujos funcionales completos — Resultado

Estado: COMPLETA

Fecha: 2026-09-30
Commit base: `08968e8` (rama `main`). Sin commits ni push.
Versiones usadas: Node `v22.22.2`, npm `10.9.7` (el proyecto declara Node 20; solo warnings de
engines). Engine de contenedores `podman` 5.8.7; imágenes `postgres:16-alpine` y `redis:7-alpine`.
No se imprimieron secretos, claves ni tokens.

## 1. Dependencias leídas y estado comprobado

- `CONTEXTO.md`, índice `PLAN.md`, `task-06/PLAN.md`.
- `task-05/resultado.md`: COMPLETA; fila 05 del índice en COMPLETA. Se reutiliza su harness
  (`test/helpers/auth-users-harness.ts`), la configuración `jest.auth-users.config.ts` y el comando
  `npm run test:auth-users`. Resultados 01–04 vigentes (B1: `.env`/`secrets/` compartidos).
- Estado real: las cinco suites enumeradas en `jest.auth-users.config.ts` no existían; el Jest
  ordinario ya las excluía (`crossServicePatterns`). `dist/` estaba al día respecto a `src/`.

## 2. Archivos cambiados y decisiones

Modificado:

1. `apps/auth-service/test/helpers/auth-users-harness.ts` (extensión, no un harness nuevo):
   - `usersServiceToken({ scope?, privateKey?, kid? })`: JWT de servicio Auth→Users firmado con
     `AUTH_OUTBOUND_SERVICE_PRIVATE_KEY` y `USERS_SERVICE_JWT_*` de `.env` (TTL 60 s, bajo el
     `maxAge` 300 s de Users). Permite scope/clave/kid incorrectos para INT-16 y preparar estados
     PENDING/CANCELLED por las rutas internas reales (INT-07/08).
   - `registrationScope`/`lookupScope` expuestos desde `.env`.
   - `queryAuthDb`/`queryUsersDb`: `psql -At` dentro de los contenedores desechables del harness,
     solo para comprobar invariantes desde las pruebas. El código productivo no cambia.
   - `RequestOptions.form` para enviar `multipart/form-data` (PATCH de perfil).
   - `AUTH_OUTBOUND_SERVICE_PRIVATE_KEY` añadida a las claves requeridas de `.env`.

Nuevos:

2. `apps/auth-service/test/helpers/auth-users-flows.ts`: flujos HTTP reutilizables (registro,
   login, refresh, validate, GET registro, lookup, GET/PATCH perfil multipart, creación directa de
   identidades en Users), `stableProblem` y un validador mínimo de respuestas contra
   `specs/.../openapi-users-service.yaml` (required, type, enum, uuid, additionalProperties).
3. `apps/auth-service/test/contract/users-registration.consumer.spec.ts`.
4. `apps/auth-service/test/contract/users-login-identity.consumer.spec.ts`.
5. `apps/auth-service/test/integration/cross-service-registration.spec.ts`.
6. `apps/auth-service/test/integration/cross-service-login.spec.ts`.
7. `apps/auth-service/test/integration/cross-service-profile.spec.ts`.

Decisiones:

- Sin cambios en código productivo: todas las pruebas pasaron contra Auth y Users reales sin
  necesitar correcciones. No se detectaron incompatibilidades nuevas.
- Cada suite aprovisiona su propio entorno desechable (≈15–20 s) con `provisionAuthUsersHarness()`;
  se ejecutan en serie (`--runInBand`, Users en el puerto fijo 3002).
- Casos positivos de perfil usan siempre el `accessToken` devuelto por el login real.
- INT-07 crea PENDING/CANCELLED en Users con token de servicio autorizado; no se añadieron
  endpoints de test.
- INT-12 comprueba la revocación en Auth (`/internal/v1/sessions/validate` → 401,
  `revokeReason = REFRESH_REUSE`). No se exige rechazo del JWT revocado en Users (Gateway).
- No se añadieron dependencias (`yaml` y `jose` ya eran dependencias de Auth).
- La documentación del README se deja para task-08.

## 3. Comandos, códigos de salida y resultados reales

```text
$ npm run test:auth-users            # exit 0 (dos ejecuciones completas verdes)
PASS test/integration/cross-service-registration.spec.ts
PASS test/integration/cross-service-login.spec.ts
PASS test/contract/users-registration.consumer.spec.ts
PASS test/integration/cross-service-profile.spec.ts
PASS test/contract/users-login-identity.consumer.spec.ts
PASS test/integration/auth-users-smoke.spec.ts
Test Suites: 6 passed, 6 total
Tests:       25 passed, 25 total
Time:        104.789 s
```

No regresión:

```sh
npm run lint:auth            # exit 0 (primera pasada: 6 errores de lint en las pruebas nuevas, corregidos)
npm run typecheck:auth       # exit 0
npm run test:auth:unit       # 146 tests, 0 fallos
npm run test:auth:contract   # 142 tests, 0 fallos
cd apps/auth-service && npx jest --selectProjects integration contract --listTests \
  | grep -cE "consumer|cross-service-|auth-users-smoke"   # 0 (excluidas del Jest ordinario)
```

## 4. Escenarios acreditados

| ID | Archivo / prueba | Resultado |
|---|---|---|
| INT-01 | `cross-service-registration` › INT-01 (GUEST y OWNER) | 201; Users GET `ACTIVE`; login 200 con role; Auth `Registration=COMPLETED`, `Credential=ACTIVE` |
| INT-02 | `cross-service-registration` › INT-02 | Misma respuesta; 1 fila Users por `registrationId`/email; 1 credencial |
| INT-03 | `cross-service-registration` › INT-03 | 409; Users conserva nombre/email; email alternativo no creado; login original 200 |
| INT-04 | `cross-service-registration` › INT-04 | Email `  MAYÚSCULAS  ` → 409; 1 fila por email normalizado; nueva key sin fila; login original 200 y contraseña del intruso 401 |
| INT-05 | `cross-service-registration` › INT-05 | Estados solo 201/503; reintento converge a 201 idéntico; 1 fila Users, 1 Registration, 1 Credential |
| INT-06 | `cross-service-login` › INT-06 | Login con email no normalizado 200; JWT RS256 con `kid`/`iss`/`aud`/`sub` de Auth, alineados con `USERS_JWT_*`; 1 sesión |
| INT-07 | `cross-service-login` › INT-07 | Contraseña errónea, ausente, PENDING, CANCELLED → 401 con problem idéntico (sin traceId/instance); sin tokens; nº de sesiones sin cambio |
| INT-08 | `users-login-identity.consumer` › INT-08 | Lookup real = exactamente `{userId, role, status: ACTIVE}` y conforme al OpenAPI; ausente/PENDING/CANCELLED → 404 indistinguibles y sin filtrar userId |
| INT-09 | `cross-service-profile` › INT-09 | Token de login: GET 200; PATCH multipart (`profile` JSON + `expectedVersion`) 200 con `version+1`; versión obsoleta 409; token inválido 401 |
| INT-10 | `cross-service-profile` › INT-10 | Tras cambiar email: login con el nuevo 200 (mismo userId); con el anterior 401 |
| INT-11 | `cross-service-profile` › INT-11 | JWT válido de otro usuario: GET y PATCH 403; perfil ajeno idéntico antes/después |
| INT-12 | `cross-service-login` › INT-12 | Refresh rota tokens (misma sesión); replay 401; validate en Auth 401; sucesor 401; `revokeReason=REFRESH_REUSE`; nuevo login válido |
| INT-16 | `users-registration.consumer` y `users-login-identity.consumer` › INT-16 | Scope incorrecto → 403 (registro, GET registro, lookup); clave no confiada con mismo kid → 401; kid desconocido / sin token → 401; access JWT de usuario como token de servicio → 401. Sin efectos en BD |
| Contrato | `users-registration.consumer` | Respuestas reales de create (201), GET (200/404), activate (200) y cancel (204) conformes al OpenAPI que parsea Auth |
| Smoke | `auth-users-smoke` (task-05) | Verde |

Pendientes (task-07): INT-13, INT-14, INT-15, INT-17. Gateway e introspección fuera de alcance.

## 5. Recursos temporales y limpieza

- Por suite: 2 PostgreSQL 16, 1 Redis (DB 15) y 2 procesos Node; retirados por `dispose()`.
- Tras las ejecuciones: `podman ps -a | grep -c stayhub-auth-users-test` → 0; puerto 3002 libre.
- `.env` y `secrets/` solo leídos; sin rotación. No se tocaron datos del desarrollador.

## 6. Instrucciones para task-07 (no ejecutada)

- Comando: `npm run test:auth-users` (requiere `.env`/`secrets/` de `npm run env:auth:dev`, podman o
  docker y el puerto 3002 libre).
- Reutilizar `provisionAuthUsersHarness()` y `test/helpers/auth-users-flows.ts`
  (`register`, `login`, `getRegistration`, `createUsersIdentity`, `queryAuthDb`/`queryUsersDb`).
- Para INT-13/14/17 hará falta ampliar el harness: hoy `USERS_SERVICE_URL` apunta fijo a
  `http://127.0.0.1:3002` y los procesos no se pueden parar/reiniciar desde las pruebas. Opciones:
  exponer `stopUsers()/startUsers()`/`restart()` y una opción para que Auth apunte a un proxy de
  fallos que reenvíe a Users real.
- Reintentos del cliente Auth (`users-service.client.ts`): timeout `AUTH_USERS_TIMEOUT_MS=3000`,
  circuit breaker con umbral 5 y reset 30 s; revisar cuántos reintentos idempotentes hace antes de
  fijar cuántas respuestas descarta el proxy en INT-14.
- INT-15: `AUTH_RECONCILER_INTERVAL_SECONDS=30`, `AUTH_RECONCILER_TTL_SECONDS=900`; sobrescribir
  en el entorno del proceso Auth del harness o preparar estado en `auth_test`. Vigilar el caso
  cancel→404 que el cliente convierte en `DependencyUnavailableError` (posible COMPENSATING
  indefinido).
- Si se añade una suite nueva (p. ej. reinicios), enumerarla en `jest.auth-users.config.ts` y en
  `crossServicePatterns` de `jest.config.ts`.
