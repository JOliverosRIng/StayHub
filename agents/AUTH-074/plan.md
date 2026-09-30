# AUTH-074 — Cerrar verificación de autenticación US2

Estado inicial: pendiente. Tipo: Verificación local.

## Resultado esperado y evidencia

El único test de sesión actual inspecciona entidad y revocación; no prueba login/refresh, Redis ni JWT.

## Preparación

Leer [reglas compartidas](../decisiones.md): D01, D02, D04–D06, D08–D10, y [auditoría](../auditoria.md). Ejecutar desde la raíz del repositorio.

Dependencias: [AUTH-049](../AUTH-049/plan.md), [AUTH-050](../AUTH-050/plan.md), [AUTH-051](../AUTH-051/plan.md), [AUTH-052](../AUTH-052/plan.md), [AUTH-053](../AUTH-053/plan.md), [AUTH-055](../AUTH-055/plan.md), [AUTH-056](../AUTH-056/plan.md), [AUTH-057](../AUTH-057/plan.md), [AUTH-058](../AUTH-058/plan.md), [AUTH-063](../AUTH-063/plan.md), [AUTH-064](../AUTH-064/plan.md), [AUTH-065](../AUTH-065/plan.md), [AUTH-066](../AUTH-066/plan.md), [AUTH-067](../AUTH-067/plan.md), [AUTH-068](../AUTH-068/plan.md), [AUTH-069](../AUTH-069/plan.md), [AUTH-071](../AUTH-071/plan.md), [AUTH-072](../AUTH-072/plan.md), [AUTH-073](../AUTH-073/plan.md).

## Archivos concretos

- `apps/auth-service/test/`
- `agents/AUTH-074/resultado.md`

## Pasos de ejecución

1. Ejecutar suite local completa con PostgreSQL 16/Redis 7 y stub Users; incluir token issuance, module wiring, SQL concurrency, replay, rate limit y security.
2. Verificar migración limpia 001–004 y actualización desde 001/002 en bases test separadas; guardar evidencia de constraints.
3. Cobertura global y afectada mínimo70% en cuatro métricas; no excluir controladores/adapters por ser difíciles de cubrir. Reparar errores dentro de Auth.
4. Relacionar FR-007–013/024, SC-002/003 y casos concretos; distinguir RED documentado para nuevos casos de pruebas agregadas retrospectivamente.
5. Documentar política de cache positiva deshabilitada en HTTP por falta de exp y fuente autoritativaDB; ninguna prueba puede asumir que Redis autoriza solo.
6. Dejar G1/G2 reales pendientes de AUTH-076–081; no marcarlos por pasar stub.

## Criterios de aceptación

- [ ] Todas las suites locales GREEN, coverage>=70%, build/types/lint correctos.
- [ ] Replay revoca con pruebas DB y rate limit se recupera con Redis real.
- [ ] No se declaran integraciones externas ejecutadas.

## Comprobación

```sh
npm run typecheck
npm run lint
npm run build
npm run test:unit
npm run test:integration
npm run test:contract
npm run test:security
npm run test:coverage --workspace @stayhub/auth-service
```

Mantener expiración absoluta, rol inmutable y límites de Auth. No implementar cookie Gateway ni acceso a users_db.

Al terminar, crear `agents/AUTH-074/resultado.md` con cambios, pruebas y bloqueos. No declarar como ejecutada una prueba pendiente de infraestructura. El estado del plan solo cambia cuando sus criterios se verifican.
