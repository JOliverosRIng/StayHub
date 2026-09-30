# AUTH-051 — Pruebas HTTP de introspección

Estado inicial: pendiente. Tipo: Pruebas de contrato.

## Resultado esperado y evidencia

ValidateSessionRequest exige sessionId/userId. No hay endpoint que lo ejecute. La ruta interna es POST aunque la pública es GET.

## Preparación

Leer [reglas compartidas](../decisiones.md): D01, D02, D04–D06, D08–D10, y [auditoría](../auditoria.md). Ejecutar desde la raíz del repositorio.

Dependencias: [PRE-001](../PRE-001/plan.md), [PRE-004](../PRE-004/plan.md).

## Archivos concretos

- `apps/auth-service/test/contract/session-validation.contract.spec.ts`
- `apps/auth-service/test/helpers/auth-app.ts`

## Pasos de ejecución

1. Probar POST /internal/v1/sessions/validate con service JWT y dos UUID: 200 exactamente active:true y role GUEST/OWNER/ADMIN.
2. No aceptar role, sid alternativo, accessToken ni campos adicionales; UUID ausente/malformado 400.
3. Session inexistente, revocada, expirada o cuyo userId difiere →401 genérico; no producir active:false 200 ni 403 para mismatch de identidad interna.
4. Prueba 503 dependenciaDB y 401 service JWT ausente/malo. Redis caído se probará con integración AUTH-057.
5. Verificar que el contrato no exige JWT de usuario ni exp en body; el Gateway ya valida firma/exp. Reejecutar al completar AUTH-071.

## Criterios de aceptación

- [ ] La respuesta no devuelve sesión completa, userId ni datos Users.
- [ ] POST interno y body actuales se conservan.

## Comprobación

```sh
npm run typecheck
npm run test --workspace @stayhub/auth-service -- --selectProjects contract --runTestsByPath test/contract/session-validation.contract.spec.ts
```

Mantener expiración absoluta, rol inmutable y límites de Auth. No implementar cookie Gateway ni acceso a users_db.

Al terminar, crear `agents/AUTH-051/resultado.md` con cambios, pruebas y bloqueos. No declarar como ejecutada una prueba pendiente de infraestructura. Registrar RED esperado antes de implementar y GREEN después; el cierre funcional pertenece al plan de verificación de la historia.
