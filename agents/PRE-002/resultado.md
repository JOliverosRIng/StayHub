# PRE-002 — Resultado de ejecución

Fecha: 2026-09-28. Base: commit `393a80d`. Estado: **Verificado localmente** contra PostgreSQL 16 y Redis 7 reales (Podman; Docker no está instalado).

Dependencias PRE-001 y PRE-004: ejecutadas.

## Cambios realizados

| Archivo | Cambio |
|---|---|
| `apps/auth-service/prisma/schema.prisma` | `Registration` gana `processingOwner UUID?`, `leaseUntil timestamptz?`, `nextAttemptAt timestamptz @default(now())` e índice `(state, nextAttemptAt, leaseUntil)`. |
| `apps/auth-service/prisma/migrations/003_registration_work/migration.sql` | **Nuevo.** Añade las columnas, el CHECK `processingOwner`/`leaseUntil` ambos nulos o ambos presentes y el índice. |
| `apps/auth-service/src/domain/registrations/registration.ts` | `RegistrationProperties` incluye los tres campos. Métodos `claim`, `renewLease`, `releaseLease`, `scheduleNextAttempt`, `isLeaseHeldBy`. `create` fija `nextAttemptAt = now` y lease nulo. |
| `apps/auth-service/src/application/ports/registration-work.port.ts` | **Nuevo.** `RegistrationWorkPort` con `createOrRead`, `claimOne`, `claimBatch`, `renew`, `release` y `transaction(context)`. Resultados `claimed`/`busy`/`terminal`/`missing`; `REGISTRATION_LEASE_SECONDS = 120`. |
| `apps/auth-service/src/infrastructure/persistence/prisma/registration.repository.ts` | Añade `PrismaRegistrationWork` (INSERT ON CONFLICT DO NOTHING + relectura; `claimOne` con `FOR UPDATE`; `claimBatch` con `FOR UPDATE SKIP LOCKED`; `renew`/`release` con owner + lease vigente) y `createRegistrationRepository(client)` atado a transacción. `persist`/`toDomain` cubren los campos nuevos. |
| `apps/auth-service/src/infrastructure/persistence/prisma/credential.repository.ts` | Añade `createCredentialRepository(client)` atado a transacción; misma persistencia. |
| `apps/auth-service/src/infrastructure/persistence/prisma/prisma.service.ts` | `hasAppliedMigrations` exige los nombres `001_auth_registration`, `002_auth_sessions`, `003_registration_work` y ninguna migración fallida (se elimina `count >= 2`). |
| `apps/auth-service/src/app.module.ts` | Provee `PrismaRegistrationWork` y expone `REGISTRATION_WORK`. |
| `apps/auth-service/src/application/ports/index.ts` | Exporta `registration-work.port`. |
| `apps/auth-service/test/integration/registration-work.spec.ts` | **Nuevo.** 10 pruebas con dos conexiones Prisma. |

Las migraciones `001`/`002` permanecen intactas (`git diff` vacío). No se añade PII al schema.

## Comportamiento verificado

- `createOrRead`: `INSERT ... ON CONFLICT ("id") DO NOTHING` + relectura por `id` y, si no, por `userId`. Compara fingerprint y conserva `userId`/hash del ganador (no sobrescribe).
- `claimOne`: `SELECT ... FOR UPDATE`, detección de estado terminal y lease vigente; solo el owner que adquiere el lease avanza.
- `claimBatch`: `UPDATE ... WHERE id IN (SELECT ... FOR UPDATE SKIP LOCKED)`; excluye `COMPLETED`/`CANCELLED` y filas con lease vigente; respeta `nextAttemptAt <= now`.
- `renew`/`release`: exigen `processingOwner = owner` (y lease vigente en `renew`); el owner anterior no puede avanzar ni liberar.
- `transaction(context)`: entrega `registrations` y `credentials` atados al mismo cliente; estado de Registration y Credential se confirman o revierten juntos.

## Evidencia

Entorno: contenedores `postgres:16-alpine` y `redis:7-alpine` de `compose.test.yml`.

```sh
npm run prisma:generate   # OK
npm run typecheck         # OK
npm run lint              # OK
npm run test:unit         # OK — 6 suites, 25 tests
npm run build             # OK — dist/apps/auth-service/main.js

TEST_AUTH_DATABASE_URL=... TEST_AUTH_REDIS_URL=... AUTH_TEST_ALLOW_CLEANUP=true \
npm run test --workspace @stayhub/auth-service -- \
  --selectProjects integration --runTestsByPath test/integration/registration-work.spec.ts
# OK — 10 tests
```

Migración desde cero probada: `prisma migrate deploy` aplicó `001_auth_registration`, `002_auth_sessions` y `003_registration_work`.

Pruebas de integración (10/10):
1. readiness con migraciones esperadas aplicadas;
2. reclamo exclusivo entre dos conexiones;
3. recuperación de lease vencido;
4. owner anterior no renueva ni libera;
5. credencial y estado cambian juntos o ninguno (rollback);
6. fila inicialmente ausente con dos conexiones → una sola fila;
7. `claimBatch` omite filas ya arrendadas;
8. estado terminal no se reclama;
9. fila inexistente → `missing`;
10. replay con fingerprint distinto no sobrescribe la fila ganadora.

## Criterios de aceptación

- [x] Solo un owner vigente puede avanzar la saga local; los reclamos no duplican filas.
- [x] Credential y estado de Registration cambian juntos o ninguno.
- [x] Una fila sin payload queda recuperable por request o compensación, sin PII agregada al schema.
- [x] Las migraciones anteriores siguen intactas.

## Bloqueos / limitaciones

- Docker no está instalado; la verificación usó Podman con el mismo `compose.test.yml`. No se construyó la imagen.
- Node 22 en lugar de 20 (misma limitación que PRE-001); sin fallos.

## Notas para AUTH-040/AUTH-043 (fuera de alcance)

- El algoritmo de `RegisterAccountUseCase` y el scheduler no se implementan aquí. El puerto ofrece lease de 120 s (`REGISTRATION_LEASE_SECONDS`), renovación antes de pasos externos y verificación de owner; el worker antiguo debe dejar de avanzar/compensar si perdió el lease.
- PRE-003 añadirá la cuarta migración a `EXPECTED_MIGRATIONS` y su readiness.
