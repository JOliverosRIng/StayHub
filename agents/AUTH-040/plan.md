# AUTH-040 — Implementar RegisterAccountUseCase

Estado inicial: pendiente. Tipo: Implementación local contra puertos.

## Resultado esperado y evidencia

Política, entidades y repositorios existen; no hay coordinador de saga. La suite de fingerprint no garantiza idempotencia real.

## Preparación

Leer [reglas compartidas](../decisiones.md): D01–D03, D07–D10; PRE-002 define la persistencia, y [auditoría](../auditoria.md). Ejecutar desde la raíz del repositorio.

Dependencias: [PRE-002](../PRE-002/plan.md), [PRE-004](../PRE-004/plan.md), [AUTH-026](../AUTH-026/plan.md), [AUTH-030](../AUTH-030/plan.md), [AUTH-031](../AUTH-031/plan.md).

## Archivos concretos

- `apps/auth-service/src/application/registration/register-account.use-case.ts`
- `apps/auth-service/src/application/registration/advance-registration.service.ts`
- `apps/auth-service/src/application/ports/auth-use-cases.port.ts`
- `apps/auth-service/test/unit/register-account.use-case.spec.ts`
- `apps/auth-service/src/domain/registrations/registration-policy.ts`

## Pasos de ejecución

1. Implementar execute({idempotencyKey,input,traceId}) tipado según PRE-004. Inyectar RegistrationWork, UsersServicePort, PasswordHasher, RegistrationPolicy, reloj, UUID y valores de reconciliación sin imports Nest/Prisma.
2. Normalizar name/email antes de policy.fingerprint, preservando password exacta. createOrRead conserva ganador; verificar fingerprint y adquirir lease antes de llamar Users. Registro busy → 503 seguro y reintentable.
3. Implementar estados D03 mediante advance-registration.service reutilizable por reconciliador; cada cambio Auth local se persiste antes del siguiente request remoto. Guardar hash una sola vez y no cambiarlo al reintentar.
4. En camino feliz comprobar respuesta Users y status ACTIVE más Credential ACTIVE antes de COMPLETED y 201. Registro COMPLETED repetido consulta resumen Users; CANCELLED → conflicto específico.
5. Un error transitorio conserva checkpoints; no ejecutar HTTP dentro de una transacción DB. Limitar retención del password al stack del request; no persistirlo ni prometer borrado físico de strings de JavaScript.
6. Añadir tests unitarios del coordinador con puertos dobles: orden, UUID, fingerprint distinto, hash no recalculado si ya existe, error al perder lease y reanudación por estado.

## Criterios de aceptación

- [ ] Un registro completo y su repetición producen el mismo id sin filas duplicadas.
- [ ] No sale éxito antes de confirmar ambos ACTIVE.
- [ ] Dominio/aplicación libres de frameworks y PII persistida.

## Comprobación

```sh
npm run typecheck
npm run test --workspace @stayhub/auth-service -- --selectProjects unit --runTestsByPath test/unit/register-account.use-case.spec.ts
```

No modificar Users/Gateway. Los contratos candidatos se prueban localmente; las tareas de integración externa certifican al proveedor real.

Al terminar, crear `agents/AUTH-040/resultado.md` con cambios, pruebas y bloqueos. No declarar como ejecutada una prueba pendiente de infraestructura. El estado del plan solo cambia cuando sus criterios se verifican.

