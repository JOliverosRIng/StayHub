# AUTH-073 — Sincronizar contratos de sesión

Estado inicial: pendiente. Tipo: Contrato Auth.

## Resultado esperado y evidencia

OpenAPI estático ya tiene tres operaciones; faltan 400 de validación y límites exactos; Swagger no se ha comparado contra implementación.

## Preparación

Leer [reglas compartidas](../decisiones.md): D01, D02, D04–D06, D08–D10, y [auditoría](../auditoria.md). Ejecutar desde la raíz del repositorio.

Dependencias: [AUTH-072](../AUTH-072/plan.md), [AUTH-047](../AUTH-047/plan.md).

## Archivos concretos

- `apps/auth-service/src/interfaces/http/login.controller.ts`
- `apps/auth-service/src/interfaces/http/sessions.controller.ts`
- `apps/auth-service/src/interfaces/http/dto/login.dto.ts`
- `apps/auth-service/src/interfaces/http/dto/refresh.dto.ts`
- `apps/auth-service/src/interfaces/http/dto/validate-session.dto.ts`
- `apps/auth-service/src/interfaces/openapi/openapi.factory.ts`
- `specs/001-fundamentos-identidad/contracts/openapi-auth-service.yaml`

## Pasos de ejecución

1. Exportar Swagger y alinear login/refresh/validate con D02; mantener cuatro POST internos y serviceAuth, no cambiar validate aGET.
2. Documentar 400 observable en tres rutas,401,503 y 429 solo login con Retry-After. minLength del refresh coherente con DTO final.
3. Response InternalTokenPair con tokens legibles, integer expiresIn 3600, ISO absoluteExpiresAt y principal; active true enum y role allowlist en validación.
4. Cerrar schemas de request y respuesta donde el contrato lo exige; conservar Problem DTO compartido de AUTH-047.
5. Probar DTO unknown fields, límites/normalización y ausencia de cookies; conservar sintaxis script actual hasta reemplazo ampliado AUTH-075.

## Criterios de aceptación

- [ ] Contrato estático y generado describen comportamiento ya ejecutado.
- [ ] No se cambia contrato G1/G2 en este plan.

## Comprobación

```sh
npm run openapi:check
npm run typecheck
npm run test:contract
```

Mantener expiración absoluta, rol inmutable y límites de Auth. No implementar cookie Gateway ni acceso a users_db.

Al terminar, crear `agents/AUTH-073/resultado.md` con cambios, pruebas y bloqueos. No declarar como ejecutada una prueba pendiente de infraestructura. El estado del plan solo cambia cuando sus criterios se verifican.
