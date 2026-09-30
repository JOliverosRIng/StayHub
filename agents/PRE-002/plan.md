# PRE-002 — Completar persistencia y exclusión de la saga de registro

Estado inicial: pendiente. Tipo: Preparación de AUTH-039 y AUTH-043.

## Resultado esperado y evidencia

withLocked no bloquea fila inexistente, save de Credential queda fuera de esa transacción y no existen claim de lotes, lease o nextAttemptAt. Un payload perdido no se puede reconstruir desde Registration.

## Preparación

Leer [reglas compartidas](../decisiones.md): D01, D03, D08, D09, y [auditoría](../auditoria.md). Ejecutar desde la raíz del repositorio.

Dependencias: [PRE-001](../PRE-001/plan.md), [PRE-004](../PRE-004/plan.md).

## Archivos concretos

- `apps/auth-service/src/application/ports/registration-work.port.ts (nuevo)`
- `apps/auth-service/src/infrastructure/persistence/prisma/registration.repository.ts`
- `apps/auth-service/src/infrastructure/persistence/prisma/credential.repository.ts`
- `apps/auth-service/src/domain/registrations/registration.ts`
- `apps/auth-service/src/infrastructure/persistence/prisma/prisma.service.ts`
- `apps/auth-service/prisma/schema.prisma`
- `apps/auth-service/prisma/migrations/003_registration_work/migration.sql (nuevo)`
- `apps/auth-service/test/integration/registration-work.spec.ts (nuevo)`

## Pasos de ejecución

1. Añadir processingOwner UUID nullable, leaseUntil timestamptz nullable, nextAttemptAt timestamptz con default now; índice por state/nextAttemptAt/leaseUntil y checks owner+lease ambos nulos o ambos presentes. Actualizar snapshot/rehydrate, conservando compatibilidad de fixtures.
2. Crear puerto RegistrationWork con createOrRead(registration), claimOne(id,owner,now,leaseUntil), claimBatch(owner,now,limit,leaseUntil), renew(id,owner,...), release(id,owner), y transacción local con repositorios Registration/Credential atados al mismo cliente. Definir resultados claimed/busy/terminal.
3. createOrRead usa INSERT ON CONFLICT DO NOTHING y relee fila ganadora; comparar fingerprint fuera de creación. Nunca sobrescribir userId/hash por un upsert de una petición perdedora.
4. claimBatch usa SELECT FOR UPDATE SKIP LOCKED de estados no terminales elegibles, luego actualiza owner/lease en la misma transacción. Lease default 120s; renovar antes de pasos externos y exigir owner + lease vigente en todo avance/release.
5. Las transacciones locales se completan antes de llamar Users. La operación externa es idempotente y conserva registrationId/userId; después de renovar/verificar lease, usar timeout limitado. Si se pierde lease, no avanzar ni compensar desde el worker antiguo.
6. Agregar pruebas de reclamo entre dos workers, recuperación de lease vencido, rollback de credencial+estado y rechazo del owner anterior. Probar fila inicialmente ausente con dos conexiones.
7. Actualizar readiness para verificar nombres 001_auth_registration, 002_auth_sessions y 003_registration_work aplicados, sin migraciones fallidas; PRE-003 agrega la cuarta. Regenerar Prisma y probar migración desde 001/002.

## Criterios de aceptación

- [ ] Solo un owner vigente puede avanzar la saga local; reclamos no duplican filas.
- [ ] Credential y estado de Registration cambian juntos o ninguno cambia.
- [ ] Una fila sin payload queda recuperable por request o compensación, sin PII agregada al schema.
- [ ] Las migraciones anteriores siguen intactas.

## Comprobación

```sh
npm run prisma:generate
npm run typecheck
npm run test --workspace @stayhub/auth-service -- --selectProjects integration --runTestsByPath test/integration/registration-work.spec.ts
```

No implementar el algoritmo de RegisterAccount ni el scheduler: corresponden a AUTH-040/043.

Al terminar, crear `agents/PRE-002/resultado.md` con cambios, pruebas y bloqueos. No declarar como ejecutada una prueba pendiente de infraestructura. El estado del plan solo cambia cuando sus criterios se verifican.

