# AUTH-069 — Resultado de ejecución

Fecha: 2026-09-29. Base revisada: commit `393a80d`, rama `Auth_Service`. Estado: **Implementado local (GREEN)**.

Dependencias leídas: AUTH-058 (prueba preparada) y AUTH-068 (implementado local). Reglas aplicadas: D01, D02,
D04–D06, D08–D10.

## Objetivo

Implementar Passport y los guards productivos de usuario: una estrategia custom `access-jwt` que delega la
criptografía al `TokenSigner` existente y exige sesión autoritativa con el mismo rol, un `AccessTokenGuard`
que distingue 401/503, y un `RolesGuard` basado en metadatos y el principal validado. Sustituye la referencia
test-local de AUTH-058.

## Cambios realizados

| Archivo | Cambio | Motivo |
|---|---|---|
| `package.json` (workspace), `apps/auth-service/package.json`, `package-lock.json` | Añadidos `@nestjs/passport@10.0.3`, `passport@0.7.0`, `passport-custom@1.2.1` (deps) y `@types/passport@1.0.17` (dev), con versiones exactas. | No había Passport instalado. |
| `src/interfaces/http/auth/authenticated-principal.ts` | **Nuevo.** `AuthenticatedPrincipal` (`userId/sessionId/role/exp`) construido solo desde el JWT verificado. | Forma tipada del `request.user`. |
| `src/interfaces/http/auth/jwt.strategy.ts` | **Nuevo.** `AccessTokenStrategy` (`@nestjs/passport` + `passport-custom`, nombre `access-jwt`): extrae bearer, `verifyAccessToken`, `ValidateSession(sub,sid,exp)` y exige `role` claim = rol de sesión. | Estrategia custom sin duplicar verificadores JOSE. |
| `src/interfaces/http/guards/access-token.guard.ts` | **Nuevo.** `AccessTokenGuard extends AuthGuard('access-jwt')`; `handleRequest` preserva `DependencyUnavailableError` (503) y errores HTTP (401), convierte el resto a 401. | 401/403/503 con causa correcta. |
| `src/interfaces/http/guards/roles.decorator.ts` | **Nuevo.** `Roles(...)` + `ROLES_KEY`. | Metadatos de roles permitidos. |
| `src/interfaces/http/guards/roles.guard.ts` | **Nuevo.** `RolesGuard` lee `ROLES_KEY` y `request.user`; sin principal → 401, rol insuficiente → 403. | Autorización sin confiar en cabeceras/body. |
| `test/security/authentication-authorization.spec.ts` | Migrada a los guards/estrategia productivos (41/41); `PassportModule` + `AccessTokenStrategy`/guards en providers. | Reejecutar AUTH-058 contra producción. |
| `test/helpers/reference-authentication.ts` | **Eliminado.** | Handoff de AUTH-058 cumplido. |

Las cuatro rutas internas (`registrations`, `login`, `sessions/refresh`, `sessions/validate`) siguen usando
`ServiceAuthGuard`; no se reemplazó por el guard de usuario. No se añadió ninguna ruta productiva de
demostración. La composición en módulos queda para AUTH-072 (los providers son `@Injectable`).

## Comportamiento verificado (41/41)

- **Access token (401):** sin bearer, firma foránea, `kid` desconocido, issuer/audience incorrectos, vencido,
  `alg:none`, `HS256`, malformado, sesión desconocida/revocada, `sub` ajeno y `role` de claim distinto del
  autoritativo. El negocio no se ejecuta.
- **Dependencia (503):** fallo del `ValidateSessionUseCase` se preserva, no se convierte en 401.
- **Roles:** identidad válida sin el rol exigido → 403; con el rol → 200 con el principal validado.
- **Principal no manipulable:** cabeceras `x-user-id`/`x-role` y campos de body no alteran el principal ni
  conceden rutas privilegiadas.
- **Service JWT:** inbound válido → 200; ausente, user JWT, token outbound, scope insuficiente, issuer/audience
  incorrectos o vencido → 401 en las cuatro rutas internas.
- **Observabilidad:** rechazo temprano conserva `x-trace-id`/`traceId` y ni el `problem` ni el log contienen
  el bearer.
- **Rotación de claves:** token firmado con una clave previa del anillo → 200; al retirarla → 401.

## Evidencia de comandos

```sh
npm run typecheck   # OK
npm run lint        # OK
npm run build       # OK
npm run test:unit   # 16 suites, 137 tests
npm run test:security   # 2 suites, 46 tests (authentication-authorization 41/41)
npm run test:contract   # 133 pasan + 1 RED esperado (trim de email, AUTH-071)

# Integración completa: 10 suites, 94 tests, 0 fallos (sin regresiones)
```

## Criterios de aceptación

- [x] Verificación criptográfica y sesión autoritativa son ambas obligatorias para el usuario.
- [x] 401/403/503 conservan la causa correcta.
- [x] No se añade endpoint público/productivo de demostración.

## Pendiente / handoff

- **AUTH-071:** los controladores de login/refresh/introspección usarán estos guards donde corresponda; las
  cuatro rutas internas siguen con `ServiceAuthGuard`.
- **AUTH-072:** registrar `PassportModule`, `AccessTokenStrategy`, `AccessTokenGuard` y `RolesGuard` en la
  composición.
- Sin bloqueos de infraestructura.
