# AUTH-046 — Resultado de ejecución

Fecha: 2026-09-28. Base revisada: commit `393a80d`, rama `Auth_Service`. Estado: **Implementado local (GREEN)**.

Dependencias: AUTH-045 (ejecutada). Reglas aplicadas: D01–D03, D07–D10.

## Objetivo

Componer el registro y las credenciales en módulos Nest, registrar el controlador y el scheduler, y dejar
`AppModule` sin providers duplicados, con un bootstrap real contra PostgreSQL/Redis y Users stub.

## Cambios realizados

| Archivo | Cambio | Motivo |
|---|---|---|
| `apps/auth-service/src/modules/credentials/credentials.module.ts` | **Nuevo.** Provee `Argon2PasswordHasher`/`PASSWORD_HASHER` y `PrismaCredentialRepository`/`CREDENTIAL_REPOSITORY`; exporta ambos tokens. | Aislar credenciales y evitar una segunda instancia de Argon2 (que regenera el hash señuelo). |
| `apps/auth-service/src/modules/registration/registration.module.ts` | **Nuevo.** Importa Core/Prisma/ServiceAuth/Credentials; registra `RegistrationController` y `RegistrationReconcilerService`; provee `REGISTRATION_WORK`, `UsersRegistrationClient`, `AdvanceRegistrationService`, `REGISTER_ACCOUNT_USE_CASE` y `RECONCILE_REGISTRATIONS` mediante factories tipadas; exporta los dos últimos. | Composición del registro. |
| `apps/auth-service/src/app.module.ts` | Importa `RegistrationModule`; se eliminan los providers de credenciales/registro ya movidos. | Evitar duplicados y UnknownDependencies. |
| `apps/auth-service/test/integration/registration-module.spec.ts` | **Nuevo.** 3 pruebas: resolución de providers, registro end-to-end por HTTP y health. | Verificar el bootstrap real. |

`core.module.ts` y `service-auth.module.ts` no requirieron cambios: ya exportan `AUTH_CONFIG`, `CLOCK`,
`UUID_GENERATOR`, `AuthLogger` y `UsersServiceClient`. No se compuso `USERS_SERVICE` con lookup: el adapter
de registro se inyecta por clase (`Pick<UsersServicePort, ...>`); el lookup llega en AUTH-063/072.

## Comportamiento verificado (3/3 GREEN)

1. `REGISTER_ACCOUNT_USE_CASE`, `RECONCILE_REGISTRATIONS`, `RegistrationController` y
   `RegistrationReconcilerService` se resuelven sin `UnknownDependenciesException`.
2. `POST /internal/v1/registrations` a través de `AppModule` con service JWT real → 201 y fila
   `COMPLETED` con el User `ACTIVE` en el stub (usa el hasher Argon2 productivo).
3. `/health/live` y `/health/ready` responden 200 (DB + Redis reales).

El cierre de la app ejecuta `onModuleDestroy` (Prisma, Redis y el scheduler) sin dejar handles.

## Evidencia de comandos

Con PostgreSQL 16 + Redis 7 de `compose.test.yml` (Podman):

```sh
npm run typecheck --workspace @stayhub/auth-service   # OK
npm run lint --workspace @stayhub/auth-service        # OK
npm run build --workspace @stayhub/auth-service       # OK
npm run test:unit --workspace @stayhub/auth-service   # OK — 8 suites, 36 tests
npm run test --workspace @stayhub/auth-service -- --selectProjects security   # OK — 5 tests

TEST_AUTH_DATABASE_URL=... TEST_AUTH_REDIS_URL=... AUTH_TEST_ALLOW_CLEANUP=true \
npm run test --workspace @stayhub/auth-service -- --selectProjects integration
# OK — 6 suites, 48 tests (módulo 3/3)
```

## Criterios de aceptación

- [x] Sin `UnknownDependenciesException` ni instancias duplicadas de providers de estado.
- [x] `AppModule` expone registro y health con componentes productivos.
- [x] Config/clock/uuid disponibles por exports explícitos.

## Pendiente / handoff

- **AUTH-047:** sincronizar OpenAPI/Swagger de registro.
- **AUTH-048:** cierre de US1 (cobertura, trazabilidad).
- Sin bloqueos de infraestructura.
