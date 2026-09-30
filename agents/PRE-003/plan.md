# PRE-003 — Crear unidad transaccional de sesiones y revocación

Estado inicial: pendiente. Tipo: Preparación de AUTH-062.

## Resultado esperado y evidencia

Los locks de Session y RefreshToken viven en transacciones separadas; llamadas save/revokeActiveForSession usan Prisma raíz. Falta Session.revokeReason, pero ya existe índice parcial de un ACTIVE.

## Preparación

Leer [reglas compartidas](../decisiones.md): D01, D04, D05, D09, y [auditoría](../auditoria.md). Ejecutar desde la raíz del repositorio.

Dependencias: [PRE-001](../PRE-001/plan.md), [PRE-002](../PRE-002/plan.md).

## Archivos concretos

- `apps/auth-service/src/application/ports/session-unit-of-work.port.ts (nuevo)`
- `apps/auth-service/src/infrastructure/persistence/prisma/session-unit-of-work.ts (nuevo)`
- `apps/auth-service/src/application/ports/repositories.port.ts`
- `apps/auth-service/src/infrastructure/persistence/prisma/{session,refresh-token}.repository.ts`
- `apps/auth-service/src/domain/sessions/session.ts`
- `apps/auth-service/prisma/schema.prisma`
- `apps/auth-service/prisma/migrations/004_session_revocation/migration.sql (nuevo)`
- `apps/auth-service/src/infrastructure/persistence/prisma/prisma.service.ts`
- `apps/auth-service/test/integration/session-unit-of-work.spec.ts (nuevo)`

## Pasos de ejecución

1. Añadir enum SessionRevokeReason REFRESH_REUSE/EXPIRED/SECURITY/USER_INACTIVE y campo nullable revokeReason a schema/entidad. Backfill SECURITY para filas con revokedAt existente, constraint coherente, revoke(now,reason) idempotente.
2. Definir SessionUnitOfWork.execute(work) que expone repositorios de sesión/tokens ligados al transaction client. Ofrecer find/insert/save, lockSession(id), lockRefresh(hash), markConsumed(id,now), insertSuccessor, linkSuccessor y revokeActiveForSession. No exportar tipos Prisma al puerto.
3. Refactorizar helpers de persistencia para aceptar cliente tx; bloquear sesión antes del token. Evitar nested withLocked que inicia otra transacción. Mantener lectura externa por hash para localizar sesión y releer bajo lock.
4. Probar orden consume viejo sin enlace → insertar nuevo → enlazar; el índice parcial y la FK existente deben permanecer habilitados.
5. Probar rollback conjunto, incremento de version, persistencia de reason, un ACTIVE por sesión y commit de resultado replay antes de lanzar error HTTP. Retries máximos 3 para serialización/deadlock, documentando códigos realmente usados.
6. Registrar la cuarta migración requerida en readiness y regenerar Prisma. Conectar el provider UoW solo cuando AUTH-072 componga SessionsModule; las pruebas pueden instanciarlo directamente.

## Criterios de aceptación

- [ ] No hay writes del cliente raíz dentro de execute; rollback revierte todas las tablas implicadas.
- [ ] Un callback que devuelve replay permite commit; un error técnico revierte la transacción.
- [ ] Session serializada incluye reason y mantiene rol/absoluteExpiresAt inmutables.

## Comprobación

```sh
npm run prisma:generate
npm run typecheck
npm run test --workspace @stayhub/auth-service -- --selectProjects integration --runTestsByPath test/integration/session-unit-of-work.spec.ts
```

No implementar rotación de negocio ni emisión final; esos planes usan esta unidad.

Al terminar, crear `agents/PRE-003/resultado.md` con cambios, pruebas y bloqueos. No declarar como ejecutada una prueba pendiente de infraestructura. El estado del plan solo cambia cuando sus criterios se verifican.

