# AUTH-032 — Pruebas del reconciliador

Estado inicial: pendiente. Tipo: Pruebas de integración.

## Resultado esperado y evidencia

No existe scheduler/reconciliador y el schema original no tiene reclamo durable.

## Preparación

Leer [reglas compartidas](../decisiones.md): D01–D03, D07–D10; PRE-002 define la persistencia, y [auditoría](../auditoria.md). Ejecutar desde la raíz del repositorio.

Dependencias: [PRE-002](../PRE-002/plan.md), [PRE-004](../PRE-004/plan.md).

## Archivos concretos

- `apps/auth-service/test/integration/registration-reconciler.spec.ts`
- `apps/auth-service/test/helpers/fake-clock.ts`
- `apps/auth-service/test/helpers/users-stub.ts`

## Pasos de ejecución

1. Sembrar filas por estado y reloj controlado; usar PostgreSQL real para SKIP LOCKED. Cubrir exactos TTL=900s, batch=50, intervalo=30s y maxAttempts=5.
2. Ejecutar dos instancias de worker con owners distintos; verificar conjuntos disjuntos, recuperación del lease tras reinicio y respeto a nextAttemptAt.
3. Probar backoff 30/60/120/240/300s con contador de fallos; no incrementar al omitir fila no elegible.
4. Matriz D03: ambos ACTIVE completa aun vencido; PENDING con hash puede avanzar; falta password espera cliente/TTL; CANCELLED remoto revoca credencial; timeout de cancelación conserva COMPENSATING.
5. Forzar cinco fallos de avance y luego más de cinco fallos de compensación: debe seguir intentando compensar. Scheduler se cancela en shutdown y no deja handles.
6. Reejecutar después de AUTH-043 y registrar exactitud temporal con fake clock, sin esperar 15 minutos reales.

## Criterios de aceptación

- [ ] Concurrencia probada contra SQL real y estados terminales no reclamados.
- [ ] Compensación nunca cancela una identidad ACTIVE.
- [ ] No se inventa password/payload para completar filas incompletas.

## Comprobación

```sh
npm run typecheck
npm run test --workspace @stayhub/auth-service -- --selectProjects integration --runTestsByPath test/integration/registration-reconciler.spec.ts
```

No modificar Users/Gateway. Los contratos candidatos se prueban localmente; las tareas de integración externa certifican al proveedor real.

Al terminar, crear `agents/AUTH-032/resultado.md` con cambios, pruebas y bloqueos. No declarar como ejecutada una prueba pendiente de infraestructura. Registrar RED esperado antes de implementar y GREEN después; el cierre funcional pertenece al plan de verificación de la historia.

