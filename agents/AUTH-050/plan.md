# AUTH-050 — Pruebas HTTP de refresh

Estado inicial: pendiente. Tipo: Pruebas de contrato.

## Resultado esperado y evidencia

RefreshSessionRequest existe; no hay SessionsController. El contrato interno recibe refresh en JSON y no en cookie.

## Preparación

Leer [reglas compartidas](../decisiones.md): D01, D02, D04–D06, D08–D10, y [auditoría](../auditoria.md). Ejecutar desde la raíz del repositorio.

Dependencias: [PRE-001](../PRE-001/plan.md), [PRE-004](../PRE-004/plan.md).

## Archivos concretos

- `apps/auth-service/test/contract/refresh.contract.spec.ts`
- `apps/auth-service/test/helpers/auth-app.ts`

## Pasos de ejecución

1. Probar POST /internal/v1/sessions/refresh con service JWT y body refreshToken; 200 InternalTokenPair y ausencia de Set-Cookie.
2. Request sin cookie debe funcionar si body es válido; cookie sin body no satisface contrato interno.
3. Distinguir 400 por shape/tipo inválido de 401 por token sintácticamente válido pero desconocido, vencido, consumido o revocado. minLength32 actual deberá reflejarse en OpenAPI si se conserva.
4. Probar 401 service JWT inválido antes del use case; 503 si persistencia falla; no exponer raw token en Problem ni log.
5. Agregar caso HTTP replay: el use case devuelve error pero el estado revocado permanece; la prueba SQL completa reside AUTH-055. RED inicial y GREEN tras AUTH-071.

## Criterios de aceptación

- [ ] No se implementa cookie en Auth ni se acepta otro campo de identidad.
- [ ] Errores y respuesta exitosa coinciden con OpenAPI actualizado.

## Comprobación

```sh
npm run typecheck
npm run test --workspace @stayhub/auth-service -- --selectProjects contract --runTestsByPath test/contract/refresh.contract.spec.ts
```

Mantener expiración absoluta, rol inmutable y límites de Auth. No implementar cookie Gateway ni acceso a users_db.

Al terminar, crear `agents/AUTH-050/resultado.md` con cambios, pruebas y bloqueos. No declarar como ejecutada una prueba pendiente de infraestructura. Registrar RED esperado antes de implementar y GREEN después; el cierre funcional pertenece al plan de verificación de la historia.
