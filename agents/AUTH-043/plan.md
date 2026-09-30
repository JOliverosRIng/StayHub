# AUTH-043 — Implementar reconciliación programada

Estado inicial: pendiente. Tipo: Implementación local.

## Resultado esperado y evidencia

La máquina de estados tiene shouldCompensate; no hay ejecución de fondo ni recuperación de registros persistidos.

## Preparación

Leer [reglas compartidas](../decisiones.md): D01–D03, D07–D10; PRE-002 define la persistencia, y [auditoría](../auditoria.md). Ejecutar desde la raíz del repositorio.

Dependencias: [AUTH-032](../AUTH-032/plan.md), [AUTH-042](../AUTH-042/plan.md).

## Archivos concretos

- `apps/auth-service/src/application/registration/reconcile-registrations.use-case.ts`
- `apps/auth-service/src/modules/registration/registration-reconciler.service.ts`
- `apps/auth-service/src/application/registration/advance-registration.service.ts`
- `apps/auth-service/src/infrastructure/config/auth-config.ts`
- `apps/auth-service/test/integration/registration-reconciler.spec.ts`

## Pasos de ejecución

1. Implementar execute() que reclama lote con owner UUID, now y lease PRE-002; usar avance compartido AUTH-040, sin payload inventado.
2. Aplicar tabla de recuperación D03, consultando Users antes de decidir compensar. Si faltan password/datos, esperar retry/TTL; si ambos ACTIVE completar incluso tras expiración.
3. Programar nextAttemptAt con backoff y aumentar fallos hasta máximo 5 para avance; COMPENSATING sigue recuperándose hasta resolución confirmada.
4. Crear scheduler Nest con setTimeout reprogramado al finalizar tick para evitar solapamiento local; default 30s tomado de config. Exponer tick para prueba e implementar OnModuleDestroy para cancelar timeout/esperar ejecución acotada.
5. Config ya exige variables; mantener defaults documentados 30/900/50/5 y agregar valores por defecto reales solo para estos parámetros con pruebas. Errores logueados por código y traceId sintético, nunca payload.
6. Ejecutar pruebas de AUTH-032 con dos workers y asegurar que el ciclo no mantiene transacciones DB abiertas mientras espera HTTP.

## Criterios de aceptación

- [ ] Cada fila converge a COMPLETED o CANCELLED cuando dependencias responden y hay datos suficientes.
- [ ] Errores externos conservan progreso durable y reintento.
- [ ] Se detiene limpiamente y respeta lotes/locks/TTL.

## Comprobación

```sh
npm run typecheck
npm run test --workspace @stayhub/auth-service -- --selectProjects integration --runTestsByPath test/integration/registration-reconciler.spec.ts
```

No modificar Users/Gateway. Los contratos candidatos se prueban localmente; las tareas de integración externa certifican al proveedor real.

Al terminar, crear `agents/AUTH-043/resultado.md` con cambios, pruebas y bloqueos. No declarar como ejecutada una prueba pendiente de infraestructura. El estado del plan solo cambia cuando sus criterios se verifican.
