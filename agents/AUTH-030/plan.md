# AUTH-030 — Pruebas de concurrencia del registro

Estado inicial: pendiente. Tipo: Pruebas de integración.

## Resultado esperado y evidencia

Solo hay tests de igualdad del fingerprint; no se ha probado creación concurrente, locks ni UUID estable.

## Preparación

Leer [reglas compartidas](../decisiones.md): D01–D03, D07–D10; PRE-002 define la persistencia, y [auditoría](../auditoria.md). Ejecutar desde la raíz del repositorio.

Dependencias: [PRE-002](../PRE-002/plan.md).

## Archivos concretos

- `apps/auth-service/test/integration/registration-concurrency.spec.ts`
- `apps/auth-service/test/integration/dependencies.setup.ts`

## Pasos de ejecución

1. Crear dos clientes Prisma/conexiones sobre base test migrada; usar barreras/promesas para solapar operaciones, no sleeps arbitrarios.
2. Lanzar creación simultánea con misma key/fingerprint y UUID candidatos distintos. Verificar una fila, un userId ganador estable y ninguna credencial sobrescrita.
3. Repetir con misma key/diferente fingerprint: un ganador y un IdempotencyConflictError en capa aplicación; demostrar ausencia de cambio en el registro inicial.
4. Probar claimOne/claimBatch excluyentes, lease expirado recuperable y avance rechazado del owner viejo usando PRE-002.
5. Después de AUTH-040/042 incorporar dos registros completos simultáneos contra Users stub y comprobar una identidad, una credencial, y respuesta repetida coherente. Probar keys diferentes con correo equivalente: uno 201 y otro 409.

## Criterios de aceptación

- [ ] Las aserciones consultan PostgreSQL real; no se simula el lock.
- [ ] Se prueba fila inexistente inicialmente, no solo actualización.
- [ ] La versión de saga del test queda GREEN al cerrar AUTH-048.

## Comprobación

```sh
npm run typecheck
npm run test --workspace @stayhub/auth-service -- --selectProjects integration --runTestsByPath test/integration/registration-concurrency.spec.ts
```

No modificar Users/Gateway. Los contratos candidatos se prueban localmente; las tareas de integración externa certifican al proveedor real.

Al terminar, crear `agents/AUTH-030/resultado.md` con cambios, pruebas y bloqueos. No declarar como ejecutada una prueba pendiente de infraestructura. Registrar RED esperado antes de implementar y GREEN después; el cierre funcional pertenece al plan de verificación de la historia.

