# AUTH-031 — Pruebas de recuperación de la saga

Estado inicial: pendiente. Tipo: Pruebas de integración.

## Resultado esperado y evidencia

No existe register-account.use-case ni suite que ejecute Auth↔Users; la máquina de estados actual solo prueba transiciones aisladas.

## Preparación

Leer [reglas compartidas](../decisiones.md): D01–D03, D07–D10; PRE-002 define la persistencia, y [auditoría](../auditoria.md). Ejecutar desde la raíz del repositorio.

Dependencias: [PRE-002](../PRE-002/plan.md), [PRE-004](../PRE-004/plan.md).

## Archivos concretos

- `apps/auth-service/test/integration/registration-saga.spec.ts`
- `apps/auth-service/test/helpers/users-stub.ts`

## Pasos de ejecución

1. Definir escenarios sobre execute tipado; PostgreSQL real, Users stub HTTP con estado autoritativo y fallo antes/después de cada mutación. El stub registra requests sin password ni JWT en logs.
2. Happy path verifica User ACTIVE, Credential ACTIVE y Registration COMPLETED; respuesta pública sin estado interno.
3. Para cada frontera create User, persist Credential, activar Credential, activar User y confirmar COMPLETED, inyectar interrupción. Reconstruir caso de uso con nueva instancia para simular reinicio y reintentar misma key.
4. Verificar que userId y hash existente no se sustituyen, no se confirma 201 con un lado PENDING y que timeout posterior a activación termina consultando estado real antes de compensar.
5. Pruebas de 409 por correo/key, 503 por Users caído, pérdida de payload antes de Credential y recuperación mediante request; no permitir login parcial. Ejecutar de nuevo con AUTH-040/042.

## Criterios de aceptación

- [ ] Cada frontera durable tiene escenario de caída y recuperación.
- [ ] Una repetición produce una sola identidad/credencial.
- [ ] Users ACTIVE por timeout no se cancela por error.

## Comprobación

```sh
npm run typecheck
npm run test --workspace @stayhub/auth-service -- --selectProjects integration --runTestsByPath test/integration/registration-saga.spec.ts
```

No modificar Users/Gateway. Los contratos candidatos se prueban localmente; las tareas de integración externa certifican al proveedor real.

Al terminar, crear `agents/AUTH-031/resultado.md` con cambios, pruebas y bloqueos. No declarar como ejecutada una prueba pendiente de infraestructura. Registrar RED esperado antes de implementar y GREEN después; el cierre funcional pertenece al plan de verificación de la historia.

