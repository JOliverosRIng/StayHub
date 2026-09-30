# AUTH-042 — Conectar saga con Users y errores recuperables

Estado inicial: pendiente. Tipo: Integración local.

## Resultado esperado y evidencia

No hay conexión actual entre el transporte Users y un caso de uso de registro; excepciones genéricas del transporte acabarían en 500.

## Preparación

Leer [reglas compartidas](../decisiones.md): D01–D03, D07–D10; PRE-002 define la persistencia, y [auditoría](../auditoria.md). Ejecutar desde la raíz del repositorio.

Dependencias: [AUTH-040](../AUTH-040/plan.md), [AUTH-041](../AUTH-041/plan.md).

## Archivos concretos

- `apps/auth-service/src/application/registration/register-account.use-case.ts`
- `apps/auth-service/src/application/registration/advance-registration.service.ts`
- `apps/auth-service/src/application/errors/auth-errors.ts`
- `apps/auth-service/src/interfaces/http/problem.mapper.ts`
- `apps/auth-service/test/integration/registration-saga.spec.ts`

## Pasos de ejecución

1. Componer coordinador y adapter real contra Users stub HTTP; conservar la misma policy/puertos de AUTH-040.
2. Convertir timeout, circuito y error de dependencia a DependencyUnavailableError; extender mapper de conflictos de registro a 409. No devolver mensaje remoto ni tratar 503 como inexistencia.
3. Tras timeout ambiguo de create/activate, consultar getRegistration en siguiente intento; reconciliar estado remoto antes de repetir o compensar.
4. Persistir lastErrorCode seguro y nextAttemptAt sin perder checkpoint. Liberar lease solo si pertenece al worker actual; fallo de DB →503, no éxito parcial.
5. Ejecutar matriz de AUTH-031 y AUTH-030; inyectar caída entre confirmación Users y persistencia COMPLETED y demostrar recuperación.

## Criterios de aceptación

- [ ] Todas las interrupciones remotas previstas terminan en 503 o reanudación correcta, no 500 genérico.
- [ ] 409 no cambia credencial ni identidad ganadora.
- [ ] No hay 201 parcial ni eliminación de User ACTIVE.

## Comprobación

```sh
npm run typecheck
npm run test --workspace @stayhub/auth-service -- --selectProjects integration --runTestsByPath test/integration/registration-saga.spec.ts
```

No modificar Users/Gateway. Los contratos candidatos se prueban localmente; las tareas de integración externa certifican al proveedor real.

Al terminar, crear `agents/AUTH-042/resultado.md` con cambios, pruebas y bloqueos. No declarar como ejecutada una prueba pendiente de infraestructura. El estado del plan solo cambia cuando sus criterios se verifican.

