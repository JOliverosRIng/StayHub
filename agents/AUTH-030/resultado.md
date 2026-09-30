# AUTH-030 — Resultado de ejecución

Fecha: 2026-09-28. Base revisada: commit `393a80d`, rama `Auth_Service`. Estado: **Implementado localmente (GREEN parcial)**.

Dependencias: PRE-002 (verificada localmente). Reglas aplicadas: D01–D03, D07–D10.

## Objetivo

Probar la concurrencia del registro contra PostgreSQL real: creación simultánea, ganador estable,
ausencia de sobrescritura de credencial, exclusividad de reclamos y recuperación de lease.

## Cambios realizados

| Archivo | Cambio | Motivo |
|---|---|---|
| `apps/auth-service/test/integration/registration-concurrency.spec.ts` | **Nuevo**. 7 pruebas con dos conexiones `PrismaService` independientes sobre la misma base migrada. | AUTH-030 no tenía suite de concurrencia; exige PostgreSQL real, sin simular locks. |

No se modificó `dependencies.setup.ts` ni código productivo: el harness PRE-002 ya expone `clean()`,
migraciones y base; las dos conexiones se construyen desde `TEST_AUTH_DATABASE_URL`.

## Comportamiento verificado (7/7 GREEN)

1. **Fila inicialmente ausente + dos conexiones:** `createOrRead` simultáneo con misma key/fingerprint y
   `userId` candidatos distintos → **una sola fila**, mismo `userId` ganador y mismo fingerprint persistido.
2. **Replay concurrente con fingerprint distinto:** el ganador inicial no se sobrescribe; fingerprint y
   `userId` se conservan.
3. **Credencial intacta:** un replay no altera la credencial del ganador (`passwordHash`/`status`).
4. **Reclamo exclusivo:** `claimOne` concurrente → exactamente un `claimed` y un `busy`.
5. **Lease vencido:** un owner nuevo reclama; el owner anterior no puede renovar ni liberar.
6. **Lotes disjuntos:** dos `claimBatch` concurrentes (SKIP LOCKED) devuelven conjuntos disjuntos y cubren
   las 6 filas.
7. **Terminal:** `COMPLETED` no se reclama (`terminal`).

Las aserciones consultan PostgreSQL real (conteos y filas persistidas); no se simula el lock ni se usan
`sleeps`.

## Evidencia de comandos

Con PostgreSQL 16 + Redis 7 de `infra/docker/auth/compose.test.yml` (Podman):

```sh
npm run typecheck --workspace @stayhub/auth-service   # OK
npm run lint --workspace @stayhub/auth-service        # OK

TEST_AUTH_DATABASE_URL="postgresql://stayhub_auth_test:test_password@127.0.0.1:55432/auth_test" \
TEST_AUTH_REDIS_URL="redis://:test_redis_password@127.0.0.1:56379/15" \
AUTH_TEST_ALLOW_CLEANUP=true \
npm run test --workspace @stayhub/auth-service -- --selectProjects integration \
  --runTestsByPath test/integration/registration-concurrency.spec.ts
# PASS — 7/7

# Proyecto de integración completo (sin regresiones): 3 suites, 23 tests, todos verdes.
```

`prisma migrate deploy` aplicó `001_auth_registration`, `002_auth_sessions`, `003_registration_work` y
`004_session_revocation` desde base vacía.

## Criterios de aceptación

- [x] Las aserciones consultan PostgreSQL real; no se simula el lock.
- [x] Se prueba fila inexistente inicialmente, no solo actualización.
- [ ] La versión de saga del test queda GREEN al cerrar AUTH-048 (pendiente de AUTH-040/042).

## Corrección posterior (detectada al ejecutar AUTH-031)

Al correr la suite repetidamente, el test “returns disjoint batches to two concurrent workers” resultó
intermitente (`A=6, B=0`), evidenciando que `claimBatch` no acotaba el `UPDATE` bajo contención. Se corrigió
`PrismaRegistrationWork.claimBatch` a `WITH selected AS (SELECT ... LIMIT n FOR UPDATE SKIP LOCKED) UPDATE
... FROM selected` (detalle en `agents/AUTH-031/resultado.md`). Tras la corrección: 12/12 ejecuciones
deterministas de esta suite y 5/5 del proyecto de integración completo.

## Pendiente / handoff

La suite queda **preparada** y debe ampliarse al conectar la saga:

- **Step 3 (capa aplicación):** el mapeo de *misma key / fingerprint distinto* a
  `IdempotencyConflictError` pertenece a `RegisterAccountUseCase` (AUTH-040). Aquí solo se verifica, a nivel
  persistencia, que la fila ganadora no cambia; la excepción se probará al incorporar el caso de uso.
- **Step 5 (saga completa):** dos registros completos simultáneos contra Users stub (una identidad, una
  credencial, repetición coherente) y keys distintas con correo equivalente (`201`/`409`) requieren
  AUTH-040/AUTH-042. Se añadirán aquí y se re-ejecutarán en AUTH-042/AUTH-048.
- Sin bloqueos de infraestructura: PostgreSQL/Redis responden con `compose.test.yml`.
