# Task 01 — GET de registro en Users — Resultado

Estado: COMPLETA

Fecha: 2026-09-29
Commit base: `08968e8` (rama `main`). Sin commits ni push.
Versiones usadas: Node `v22.22.2`, npm `10.9.7`. El `engines` del proyecto pide
`>=20 <21`; se registra la diferencia (solo warnings de npm, todo ejecutó igual).
Prisma Client `6.19.0`. No se leyeron ni imprimieron secretos de `.env`.

## 1. Dependencias leídas y estado comprobado

- `agents/integracion/CONTEXTO.md`, `agents/integracion/PLAN.md` (índice) y
  `agents/integracion/task-01/PLAN.md`.
- **Dependencia declarada: ninguna.** task-01 es la primera fila del índice; no existe
  `task-01/resultado.md` previo. No se avanzó a task-02.
- Fuentes históricas leídas: `specs/001-fundamentos-identidad/spec.md`,
  `plan.md`, `tasks/tasks_userService.md` (USR-071–078),
  `tasks/tasks_authService.md` (AUTH-076–084), `apps/users-service/REVALIDACION.md`,
  `agents/result/README.md`, `agents/result/bloque-3.md`, `agents/result/bloque-4.md`,
  `agents/contrato-users-candidato.md` y ambos OpenAPI internos.
- `git status --short` inicial: solo `agents/`, `guia/`, `guia-v2/` e `integracion.sh`
  sin rastrear (trabajo del usuario). No había cambios rastreados previos. Se conservan.
- Estado real confirmado: `User.registrationId` es UUID único; existía proyección
  `summary` pero no la consulta por `registrationId`; el controlador interno solo
  tenía POST; Auth ya llama al GET faltante.

## 2. Archivos cambiados y decisiones

Código de producción:

1. `apps/users-service/src/application/ports/user.repository.ts` — nuevo método
   `findByRegistrationId(registrationId): Promise<UserSummary | null>`.
2. `apps/users-service/src/infrastructure/persistence/prisma/user.repository.ts` —
   `findUnique({ where: { registrationId } })` y proyección de los cinco campos.
   `null` solo cuando no existe; **no** se capturan errores de BD, de modo que
   `PrismaClientInitializationError`/`P1017`/etc. lleguen al `problem.mapper`
   (`isDatabaseUnavailable` → 503) y no se conviertan en ausencia.
3. `apps/users-service/src/application/registration/get-registration.use-case.ts` (nuevo)
   — `GetRegistration`: `RegistrationId.parse(id)`; si el repositorio devuelve `null`,
   lanza `DomainError('NOT_FOUND')`.
4. `apps/users-service/src/interfaces/http/internal/registration.controller.ts` —
   inyecta `GetRegistration` y añade `@Get(':registrationId')`. Hereda el guard y el
   scope de clase `ServiceScope('registration')`; el controlador solo delega.
5. `apps/users-service/src/modules/registration-state.module.ts` — registra
   `GetRegistration` con la misma fábrica `USER_REPOSITORY` que los otros tres.
6. `apps/users-service/src/interfaces/openapi/registration.openapi.ts` — nuevo
   `RegistrationGetApi` con `operationId: getRegistration`, parámetro UUID y
   respuestas 200/400/401/403/404/503 con el `userSummarySchema` existente.
7. `specs/001-fundamentos-identidad/contracts/openapi-users-service.yaml` — regenerado
   con `node scripts/validate-users-openapi.mjs --write` (mecanismo indicado en
   task-08). Decisión: el YAML rastreado ya tenía drift previo respecto al Swagger
   generado (operaciones sin `tags`, anclas YAML `&a1/*a1` frente a esquemas
   expandidos). Se verificó restaurando el YAML de `HEAD` y ejecutando el validador:
   fallaba por ese drift, no solo por el GET nuevo. La regeneración añade la ruta GET
   y normaliza el resto al formato del generador; no cambia semántica de otras
   operaciones.
8. Dobles tipados ajustados: `apps/users-service/test/unit/http-adapters.spec.ts` añade
   `findByRegistrationId: jest.fn()` al doble de `UserRepository` y actualiza a 9 el
   número de rutas publicadas, comprobando `operationId: getRegistration`.

Pruebas:

9. `apps/users-service/test/contract/registration.contract.spec.ts` — casos GET
   funcionales (PENDING/ACTIVE/CANCELLED, 404/400, lecturas repetidas sin mutación).
10. `apps/users-service/test/security/service-auth.spec.ts` — casos GET de seguridad
    (firma ajena 401, ausente/malformado/issuer/audience/exp 401, scope lookup 403,
    repositorio de consulta no invocado, persistencia no disponible 503).

## 3. Contrato implementado

```text
GET /internal/v1/registrations/{registrationId}
Authorization: Bearer <JWT de servicio>
Scope: users:registration
200 -> { id, name, email, role, status }   (UserSummary, estado actual)
400 UUID mal formado; 401 JWT ausente/inválido; 403 scope insuficiente;
404 registro ausente; 503 base no disponible
```

La autenticación y el scope se evalúan en `ServiceAuthGuard` antes del handler y de
toda consulta. La ruta no activa, cancela ni modifica registros.

## 4. Comandos, códigos de salida y resultados reales

Fallo inicial (ruta ausente, evidencia RED):

```sh
USERS_TEST_DATABASE_URL=... npm run test:contract --workspace @stayhub/users-service \
  -- --runTestsByPath test/contract/registration.contract.spec.ts
# FAIL: 3 failed, 7 passed (GET devolvía 404 en lugar de 200; 404/400 no distinguibles)
npm run test:security --workspace @stayhub/users-service \
  -- --runTestsByPath test/security/service-auth.spec.ts
# FAIL: 8 failed, 7 passed (las lecturas no existían)
```

Tras implementar (GREEN):

```sh
npm run prisma:users:generate            # exit 0, Prisma Client 6.19.0 generado
USERS_TEST_DATABASE_URL=... npm run test:contract --workspace @stayhub/users-service \
  -- --runTestsByPath test/contract/registration.contract.spec.ts   # 10/10, exit 0
npm run test:security --workspace @stayhub/users-service \
  -- --runTestsByPath test/security/service-auth.spec.ts            # 15/15, exit 0
USERS_TEST_DATABASE_URL=... npm run test:users                      # 24 suites, 169 tests, 0 fallos, exit 0
npm run typecheck:users                                             # exit 0
npm run lint:users                                                  # exit 0
npm run build:users                                                 # exit 0
node scripts/validate-users-openapi.mjs --write                     # exit 0, contrato actualizado
node scripts/validate-users-openapi.mjs                             # exit 0, sin drift
```

La base de datos usada es un PostgreSQL 16 desechable en `127.0.0.1:55432/users_db`
(harness `postgres.setup.ts`, esquema por suite y limpieza al cerrar). No se usaron
secretos reales ni la base de desarrollo.

## 5. Escenarios acreditados y pendientes

Acreditados:

- Crear PENDING por HTTP y consultar: 200 con proyección exacta de cinco campos.
- Activar por HTTP y consultar: `ACTIVE`.
- Crear otro, cancelar y consultar: `CANCELLED` (no se filtra solo ACTIVE).
- UUID válido inexistente → 404; UUID mal formado → 400.
- JWT ausente/expirado/firmado con clave ajena → 401; solo scope lookup → 403.
- Fallos de autenticación/scope no invocan `findUnique` del repositorio.
- Lecturas repetidas no alteran `updatedAt`, estado ni otros datos persistidos.
- Persistencia no disponible → 503 (nunca 404 ni éxito), con Problem Details y `traceId`.

Pendientes / fuera de alcance (no bloquean task-01):

- Introspección de sesión activa/revocada en el borde: corresponde al futuro Gateway.
- Recorrido conjunto Auth↔Users (login real→perfil) y emisión real de ambos JWT:
  se acredita en task-02/task-05/task-06. En esta tarea se usó el emisor de fixtures.
- No se tocó Auth, Gateway ni el arranque de desarrollo/Compose.

## 6. Recursos temporales creados y limpieza

- Se ejecutó `npm ci` desde `package-lock.json` porque `passport-jwt` no estaba
  instalado (el contrato no arrancaba por `TS2307`). No se modificó `package-lock.json`.
- Prisma Client generado en `apps/users-service/src/infrastructure/persistence/generated/prisma`
  (ignorado por git; necesario para compilar y probar).
- Contenedor `stayhub-users-test-db` (PostgreSQL 16 en 127.0.0.1:55432) creado para las
  pruebas y retirado al terminar. No existía ni se alteró ninguna base de datos previa.
- No se eliminaron dobles de pruebas ni datos del usuario.

## 7. Instrucciones para task-02 (no ejecutada)

Task-02 = "JWT y configuración persistente compartida". Punto de partida:

- Users ya expone `GET /internal/v1/registrations/{registrationId}` con scope
  `users:registration`; el guard ya valida pertenencia del scope separado por espacios.
- Alinear `.env.example` y `scripts/generate-auth-dev-env.mjs` según la tabla B1 de
  `task-02/PLAN.md`. El token de Auth→Users debe llevar
  `AUTH_OUTBOUND_SERVICE_SCOPE=users:registration users:login-identity` (tuvo que ser
  `users:identity` en el ejemplo actual). `USERS_REGISTRATION_SCOPE=users:registration`
  y `USERS_LOOKUP_SCOPE=users:login-identity` no se unifican.
- Mantener dos pares RSA distintos (access de usuario y servicio Auth→Users) y el tercer
  par del llamador Gateway→Auth. Users solo recibe claves públicas.
- Para verificar B2, el harness de pruebas de Users acepta `USERS_TEST_DATABASE_URL`
  apuntando a `/users_db` en PostgreSQL 16; conviene levantar un contenedor desechable
  (p. ej. `podman run -d --name ... -e POSTGRES_DB=users_db -e POSTGRES_USER=users -e
  POSTGRES_PASSWORD=... -p 127.0.0.1:55432:5432 postgres:16-alpine`). No reutilizar la
  base de desarrollo ni ejecutar `npm ci` si las dependencias ya están completas.
- Evidencia B2 de emisor real → recepción en Users es dirigida; el recorrido
  login→perfil se acredita en task-06 y debe distinguirse explícitamente.
