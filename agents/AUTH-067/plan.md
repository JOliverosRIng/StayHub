# AUTH-067 — Implementar rotación y revocación por replay

Estado inicial: pendiente. Tipo: Implementación caso de uso.

## Resultado esperado y evidencia

No existe RotateRefreshTokenUseCase; los repositorios originales no aseguran atomicidad entre entidades. PRE-003 resuelve esa base.

## Preparación

Leer [reglas compartidas](../decisiones.md): D01, D02, D04–D06, D08–D10, y [auditoría](../auditoria.md). Ejecutar desde la raíz del repositorio.

Dependencias: [AUTH-055](../AUTH-055/plan.md), [AUTH-066](../AUTH-066/plan.md).

## Archivos concretos

- `apps/auth-service/src/application/sessions/rotate-refresh-token.use-case.ts`
- `apps/auth-service/src/application/ports/session-unit-of-work.port.ts`
- `apps/auth-service/test/integration/refresh-rotation.spec.ts`
- `apps/auth-service/test/unit/rotate-refresh-token.use-case.spec.ts`

## Pasos de ejecución

1. execute({refreshToken,traceId}) obtiene hash vía codec y lookup sessionId sin confiar en contenido del raw token; token desconocido 401.
2. Dentro UoW bloquear sesión y luego token, releer estados y verificar sesión activa y vencimiento exacto. No consultar Users ni extender expiry.
3. CONSUMED: revoke REFRESH_REUSE y revokeActiveForSession en la misma tx; devolver resultado replay. Fuera de UoW invalidar cache best-effort y lanzar RefreshTokenInvalidError. Nunca lanzar el error de negocio dentro para revertir revocación.
4. ACTIVE: preparar nuevos tokens, consumir viejo sin link, insertar sucesor, enlazar viejo e incrementar version. Firmar antes del commit; devolver respuesta solo después.
5. Token REVOKED/vencido y sesión inválida 401 sin inserciones; error DB/firma 503 con rollback. Reintentos limitados del UoW solo por serialización.
6. Ejecutar AUTH-055 y pruebas unitarias que distinguen validación, commit replay y error técnico. Caché caída no impide revocación PostgreSQL.

## Criterios de aceptación

- [ ] Una rotación produce un sucesor y conserva role/userId/expiry.
- [ ] Replay revoca efectivamente incluso cuando respuesta es 401.
- [ ] Concurrencia satisface resultado descrito D04.

## Comprobación

```sh
npm run typecheck
npm run test --workspace @stayhub/auth-service -- --selectProjects integration --runTestsByPath test/integration/refresh-rotation.spec.ts
```

Mantener expiración absoluta, rol inmutable y límites de Auth. No implementar cookie Gateway ni acceso a users_db.

Al terminar, crear `agents/AUTH-067/resultado.md` con cambios, pruebas y bloqueos. No declarar como ejecutada una prueba pendiente de infraestructura. El estado del plan solo cambia cuando sus criterios se verifican.
