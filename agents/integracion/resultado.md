# Integración Auth ↔ Users — Resultado global

Estado: **COMPLETA** para la integración Auth↔Users sin Gateway. Gateway, HTTPS de borde, revisión
humana G1/G2 y CI remota **no** forman parte de este resultado y siguen pendientes (§8).

Detalle por tarea: [task-01](task-01/resultado.md) … [task-08](task-08/resultado.md).

## 1. Entorno

- Fecha: 2026-09-29 → 2026-09-30. Commit base `08968e8` (`main`); sin commits ni push.
- Node `v22.22.2` y npm `10.9.7` (el proyecto declara Node 20; solo avisos). Prisma `6.19.0`.
- Engine: `podman` 5.8.7 + `podman-compose`. `docker` no se ejecutó.

## 2. Archivos cambiados por grupo

| Grupo | Archivos | Propósito |
|---|---|---|
| Users: GET de registro | `application/ports/user.repository.ts`, `infrastructure/persistence/prisma/user.repository.ts`, `application/registration/get-registration.use-case.ts` (nuevo), `interfaces/http/internal/registration.controller.ts`, `modules/registration-state.module.ts`, `interfaces/openapi/registration.openapi.ts`, `specs/.../openapi-users-service.yaml` | Consulta interna por `registrationId` protegida por service JWT; contrato regenerado sin drift (task-01) |
| Users: runtime | `interfaces/openapi/openapi.factory.ts` (`USERS_SWAGGER_SERVER_URL`), `infra/docker/users/Dockerfile` (runtime con `@nestjs/swagger`), `docker-compose.yml` (healthcheck de `users-service`) | Swagger y contenedor de Users funcionales (task-03/04) |
| Configuración compartida | `.env.example`, `scripts/lib/dev-env.mjs` (nuevo), `scripts/generate-auth-dev-env.mjs` | `.env`/`secrets/` persistentes, alineados (B1) y sin rotación (task-02) |
| Arranque de desarrollo | `scripts/dev-auth-swagger.mjs`, `infra/docker/dev/compose.deps.yml` (nuevo), `infra/docker/auth/compose.dev.yml`, `package.json` | `dev:swagger` y `dev:swagger:docker` con Users real, sin `users-stub` y conservando datos (task-03/04) |
| Auth: código productivo | `application/registration/reconcile-registrations.use-case.ts` | Una compensación sin identidad remota (404 autenticado) pasa a `CANCELLED` en lugar de quedar en `COMPENSATING` indefinidamente (task-07) |
| Auth: build y Jest | `tsconfig.json`, `tsconfig.build.json`, `jest.config.ts`, `jest.auth-users.config.ts` (nuevo), `apps/auth-service/package.json` | Comando `test:auth-users`; suites excluidas del Jest ordinario; build sin TS6059 (task-05/07) |
| Auth: harness y suites | `test/helpers/auth-users-harness.ts`, `auth-users-flows.ts`, `users-fault-proxy.ts`, `test/auth-users/setup.ts`, 2 suites de contrato y 7 de integración `cross-service-*`/smoke, más `test/security/service-trust.spec.ts` y `test/unit/dev-env-generator.spec.ts` | Pruebas reales Auth↔Users (task-02, task-05–07) |
| Pruebas existentes ampliadas | Users: `registration.contract.spec.ts`, `service-auth.spec.ts`, `http-adapters.spec.ts`. Auth: `registration-reconciler.spec.ts` | GET y regresiones de la compensación |
| Documentación | READMEs de Auth y Users, `docs/dev-swagger.md`, `REVALIDACION.md`, `agents/contrato-users-candidato.md`, `agents/result/README.md`, `tasks.md` y backlogs | task-08 |

## 3. Contrato del GET y configuración de confianza (sin secretos)

```text
GET /internal/v1/registrations/{registrationId}          (users-service, solo lectura)
Authorization: Bearer <service JWT Auth->Users>          scope: users:registration
200 { id, name, email, role, status }   status actual: PENDING | ACTIVE | CANCELLED
400 UUID inválido · 401 JWT ausente/inválido · 403 scope insuficiente
404 registro inexistente · 503 base de datos no disponible
```

| Par de claves | Emisor → verificador | kid / iss / aud / scope |
|---|---|---|
| Access JWT de usuario | Auth (privada) → Users (solo pública) | `stayhub-auth-2026-01` / `https://auth.stayhub.internal` / `stayhub-api` |
| Service JWT Auth→Users | Auth (privada) → Users (solo pública) | `auth-users-2026-01` / `stayhub-auth-service` / `stayhub-users-service` / `users:registration users:login-identity` (TTL 60 s) |
| Service JWT de llamador→Auth | Gateway (en desarrollo, `secrets/gateway-private.pem`) → Auth | `gateway-dev-2026-01` / `stayhub-dev-gateway` / `stayhub-auth-service-dev` / `auth:invoke` |

Users mantiene separados los scopes `users:registration` (registro) y `users:login-identity`
(lookup) y nunca recibe claves privadas.

## 4. Escenarios INT-01–17

Todos se ejecutaron con `npm run test:auth-users` (Auth y Users reales, sin Gateway ni stub) en la
ejecución final del 2026-09-30: 9 suites, 38 tests, exit 0.

| ID | Resultado | Prueba | Observado |
|---|---|---|---|
| INT-01 | PASS | `cross-service-registration` › INT-01 (GUEST, OWNER) | 201; Users `ACTIVE`; login 200 con el rol; Auth `COMPLETED` con credencial `ACTIVE` |
| INT-02 | PASS | › INT-02 | Misma respuesta; 1 fila en Users y 1 credencial |
| INT-03 | PASS | › INT-03 | 409; identidad original intacta |
| INT-04 | PASS | › INT-04 | Correo equivalente → 409; 1 fila por correo normalizado; la contraseña del intruso da 401 |
| INT-05 | PASS | › INT-05 | Solo 201/503; el reintento converge a una sola identidad |
| INT-06 | PASS | `cross-service-login` › INT-06 | Correo no normalizado → 200; JWT RS256 con kid/iss/aud/sub de Auth |
| INT-07 | PASS | › INT-07 | Contraseña errónea, usuario ausente, PENDING o CANCELLED → 401 idéntico, sin sesión |
| INT-08 | PASS | `users-login-identity.consumer` › INT-08 | Exactamente `{userId, role, status: ACTIVE}`; ausente/no activo → 404 indistinguibles |
| INT-09 | PASS | `cross-service-profile` › INT-09 | Token del login: GET 200, PATCH multipart 200 (`version+1`); versión obsoleta 409 |
| INT-10 | PASS | › INT-10 | Correo nuevo → login 200; correo anterior → 401 |
| INT-11 | PASS | › INT-11 | JWT de otro usuario → 403 en GET y PATCH, sin cambios |
| INT-12 | PASS | `cross-service-login` › INT-12 | Rotación 200; replay 401; `validate` en Auth 401; `REFRESH_REUSE` |
| INT-13 | PASS | `cross-service-recovery` › INT-13 (x2) | Users caído o inalcanzable → 503 seguro; nada confirmado; el reintento converge |
| INT-14 | PASS | › INT-14 (x3) | Proxy descarta la respuesta tras la escritura: con 1 pérdida el retry interno da 201; con 2, el reintento con la misma key reutiliza la identidad; nunca cancela un ACTIVE |
| INT-15 | PASS | `cross-service-reconciliation` (x5) | Antes de crear: espera dentro del TTL y `CANCELLED` al vencerlo (antes del fix: `COMPENSATING` indefinido). Tras crear: completa. PENDING vencido: se cancela en Users. ACTIVE vencido: `COMPLETED`. Users caído: no cierra |
| INT-16 | PASS | `users-registration.consumer`, `users-login-identity.consumer` › INT-16 | Scope incorrecto → 403; clave no confiada, kid desconocido o sin token → 401; access JWT como token de servicio → 401 |
| INT-17 | PASS | `cross-service-restart` › INT-17 | Reinicio de procesos, PostgreSQL y Redis: login 200 con el mismo `userId`; perfil, idempotencia y sesión previa conservados |

Invariante comprobado: ninguna identidad `ACTIVE` en Users tiene la credencial revocada o ausente en
Auth (`activeUsersWithoutUsableCredential() == []`).

## 5. Comandos, tests y cobertura (verificación final)

| Comando | Exit | Tests |
|---|---|---|
| `npm run prisma:auth:generate` / `prisma:users:generate` | 0 / 0 | — |
| `npm run typecheck` / `lint` / `build` | 0 / 0 / 0 | — |
| `npm run test:users` | 0 | 24 suites, 169 |
| `npm run test:auth` | 0 | 40 suites, 454 |
| `npm run openapi:auth:check` | 0 | 11 |
| `node scripts/validate-users-openapi.mjs` | 0 | sin drift |
| `npm run test:auth-users` | 0 | 9 suites, 38 |

Cobertura: Auth 88.81 / 74.06 / 88.69 / 90.03 y Users 96.27 / 90.80 / 95.48 / 97.93 (sentencias /
ramas / funciones / líneas). El umbral global del 70 % se cumple en ambos. El archivo productivo de
Auth modificado obtiene 92.96 / 86.95 / 100 / 94.21; los de Users obtienen 100 %, salvo
`user.repository.ts` (97 / 100 / 100 / 96). Detalle en [task-08](task-08/resultado.md).

## 6. Modos de arranque y persistencia

- **`npm run dev:swagger`** (nativo): readiness y `/docs` 200 en ambos; registro 201, login 200,
  perfil GET/PATCH 200, ajeno 403, token de servicio en perfil 401; sin `users-stub`. Ctrl+C no deja
  procesos. Al reiniciar se conservan el mismo `userId` y el perfil.
- **`npm run dev:swagger:docker`**: migraciones exit 0, Users healthy antes que Auth y el mismo
  recorrido. Solo se publican `127.0.0.1:3001` y `127.0.0.1:3002`. La parada no usa `-v` y conserva
  los volúmenes. Al reiniciar se conservan el mismo `userId` y el perfil.
- `.env` y `secrets/`: sha256 idéntico antes y después de ambos recorridos, sin regeneración.
- El Compose base no publica ningún puerto.

## 7. Recursos temporales y datos previos

- Entornos de prueba (`stayhub-auth-users-test-*`, `stayhub-task07-*`, `stayhub-task08-*`),
  temporales de secretos y archivos en `/tmp`: creados y eliminados. Estado final: 0 contenedores
  propios en marcha y puertos 3001/3002 libres.
- Artefactos `jest.*.js/.d.ts/.map` de una build fallida (task-07): eliminados.
- Conservados: volúmenes de desarrollo `stayhub-auth-users-dev_*` y `stayhub-auth-dev_*`, con
  usuarios sintéticos `@example.test`; `.env` y `secrets/`; y los recursos previos del usuario
  (`stayhub-auth-test*` y contenedores ajenos). No se borraron datos existentes, salvo un volumen
  de desarrollo con contraseña antigua durante task-04 (registrado allí).

## 8. Limitaciones pendientes

Dependen de Gateway o de terceros (fuera de alcance):
- Introspección de sesión antes del perfil. Users acepta el JWT de una sesión revocada hasta que
  expire; Auth sí la declara inválida (INT-12).
- Rutas públicas, HTTPS de borde y cookie de refresh (AUTH-078, AUTH-081, USR-073, USR-077).
- Aprobación contractual humana de G2/G1 y CI remota (USR-074–076, USR-078, AUTH-084).

Propias de esta integración (no bloquean el cierre, quedan documentadas):
- Si una creación llega tarde a Users después de cancelarse el registro, la identidad queda
  `PENDING` y conserva reservado su correo. No se puede autenticar y Auth no la reanuda; liberarla
  requeriría un protocolo nuevo.
- El timeout literal del cliente solo se probó con el doble de Users. Contra Users real se probaron
  conexión rechazada y respuesta perdida. Por eso AUTH-076, AUTH-079 y USR-071 siguen abiertas.
- El harness automático usa procesos `node dist` y bases en contenedor, no Compose. Compose se
  verificó con `dev:swagger:docker`.
- Solo se verificó con Node 22 y podman.

Backlog sincronizado: se marcaron AUTH-077, AUTH-080 y USR-072; el resto de tareas mixtas tienen
nota de la parte Auth↔Users completada.
