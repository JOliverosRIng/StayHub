# AUTH-071 — Exponer controladores de login, refresh e introspección

Estado inicial: pendiente. Tipo: Implementación HTTP.

## Resultado esperado y evidencia

Los DTO existen pero no controladores. Tokens response están marcados writeOnly y LoginRequest no recorta email.

## Preparación

Leer [reglas compartidas](../decisiones.md): D01, D02, D04–D06, D08–D10, y [auditoría](../auditoria.md). Ejecutar desde la raíz del repositorio.

Dependencias: [AUTH-049](../AUTH-049/plan.md), [AUTH-050](../AUTH-050/plan.md), [AUTH-051](../AUTH-051/plan.md), [AUTH-065](../AUTH-065/plan.md), [AUTH-067](../AUTH-067/plan.md), [AUTH-068](../AUTH-068/plan.md), [AUTH-069](../AUTH-069/plan.md).

## Archivos concretos

- `apps/auth-service/src/interfaces/http/login.controller.ts`
- `apps/auth-service/src/interfaces/http/sessions.controller.ts`
- `apps/auth-service/src/interfaces/http/dto/login.dto.ts`
- `apps/auth-service/src/interfaces/http/dto/refresh.dto.ts`
- `apps/auth-service/src/interfaces/http/dto/validate-session.dto.ts`
- `apps/auth-service/test/contract/login.contract.spec.ts`
- `apps/auth-service/test/contract/refresh.contract.spec.ts`
- `apps/auth-service/test/contract/session-validation.contract.spec.ts`

## Pasos de ejecución

1. Registrar POST internal/v1/login, POST internal/v1/sessions/refresh y POST internal/v1/sessions/validate con HttpCode 200 y ServiceAuthGuard.
2. Inyectar execute de casos de uso mediante tokens/factories; extraer traceId, pasar DTO permitido y devolver objetos de respuesta explícitos.
3. Transformar trim(email) antes de @IsEmail; lowercase en caso de uso. Password sin transformación. Conservar cierre whitelist y shape de refresh/validate.
4. Quitar writeOnly de propiedades de respuesta token, declarar expiresIn integer enum 3600, principal DTO. Documentar minLength32 del refresh request o quitarlo si no forma parte del contrato acordado; decisión local por defecto conservar/documentar.
5. Decoradores operationIds login/rotateRefreshToken/validateSession, serviceAuth y respuestas de D02. Retry-After viene del filtro AUTH-064.
6. Ejecutar tres suites de contrato y guard: service JWT por Authorization, refresh solo body, sin Set-Cookie ni roles body.

## Criterios de aceptación

- [ ] Las tres rutas responden en HTTP real y no dependen de mocks del guard.
- [ ] Los errores se traducen por filtro común.
- [ ] No aparece cookie o perfil en contrato interno.

## Comprobación

```sh
npm run typecheck
npm run test --workspace @stayhub/auth-service -- --selectProjects contract --testPathPattern='login.contract|refresh.contract|session-validation.contract'
```

Mantener expiración absoluta, rol inmutable y límites de Auth. No implementar cookie Gateway ni acceso a users_db.

Al terminar, crear `agents/AUTH-071/resultado.md` con cambios, pruebas y bloqueos. No declarar como ejecutada una prueba pendiente de infraestructura. El estado del plan solo cambia cuando sus criterios se verifican.
