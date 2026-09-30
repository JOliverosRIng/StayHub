# AUTH-048 — Cerrar verificación de registro US1

Estado inicial: pendiente. Tipo: Verificación local.

## Resultado esperado y evidencia

Ninguna suite de registro HTTP/integración existe en la base. Las cuatro unitarias no acreditan la saga.

## Preparación

Leer [reglas compartidas](../decisiones.md): D01–D03, D07–D10, y [auditoría](../auditoria.md). Ejecutar desde la raíz del repositorio.

Dependencias: [AUTH-026](../AUTH-026/plan.md), [AUTH-030](../AUTH-030/plan.md), [AUTH-031](../AUTH-031/plan.md), [AUTH-032](../AUTH-032/plan.md), [AUTH-033](../AUTH-033/plan.md), [AUTH-040](../AUTH-040/plan.md), [AUTH-041](../AUTH-041/plan.md), [AUTH-042](../AUTH-042/plan.md), [AUTH-043](../AUTH-043/plan.md), [AUTH-045](../AUTH-045/plan.md), [AUTH-046](../AUTH-046/plan.md), [AUTH-047](../AUTH-047/plan.md).

## Archivos concretos

- `apps/auth-service/test/unit/`
- `apps/auth-service/test/integration/registration-*.spec.ts`
- `apps/auth-service/test/contract/registration.contract.spec.ts`
- `apps/auth-service/test/security/registration-secrets.spec.ts`
- `agents/AUTH-048/resultado.md`

## Pasos de ejecución

1. Ejecutar unitarias y suites de registro con PostgreSQL 16/Redis 7 reales y Users stub candidato. Aplicar migraciones desde base vacía y desde 001/002.
2. Registrar commit, versiones, comandos, cantidades de tests, cobertura de módulos de registro/credenciales y resultados concurrency/crash/reconciliación.
3. Si el umbral global incluye sesiones aún sin terminar, conservarlo; calcular además cobertura afectada de US1 con selección explícita. No excluir ramas reales para obtener >=70%.
4. Mapear FR-001–006 y FR-024 a nombres de pruebas. Registrar que los tests nuevos se prepararon RED; si no hay evidencia histórica para código ya existente, declarar desconocido.
5. Cerrar fallos encontrados dentro de Auth; diferenciar verde local con stub de validación G2 pendiente AUTH-076/079.

## Criterios de aceptación

- [ ] Unit/contract/integration/security de US1 GREEN, sin tests omitidos.
- [ ] Cobertura afectada >=70% con ramas/funciones/líneas/sentencias registradas.
- [ ] Queda declarada la dependencia externa del GET candidato.

## Comprobación

```sh
npm run typecheck
npm run lint
npm run build
npm run test --workspace @stayhub/auth-service -- --selectProjects unit integration contract security --testPathPattern=registration
npm run test:coverage --workspace @stayhub/auth-service -- --testPathPattern=registration
```

No modificar Users/Gateway. Los contratos candidatos se prueban localmente; las tareas de integración externa certifican al proveedor real.

Al terminar, crear `agents/AUTH-048/resultado.md` con cambios, pruebas y bloqueos. No declarar como ejecutada una prueba pendiente de infraestructura. El estado del plan solo cambia cuando sus criterios se verifican.
