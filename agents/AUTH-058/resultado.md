# AUTH-058 — Resultado de ejecución

Fecha: 2026-09-28. Base revisada: commit `393a80d`, rama `Auth_Service`. Estado: **Prueba preparada (GREEN contra referencia test-local; guard/estrategia productivos pendientes en AUTH-069)**.

Dependencias leídas: PRE-001 y AUTH-053 (verificadas localmente). Reglas aplicadas: D01, D02, D04–D06, D08–D10.

## Objetivo

Acreditar autenticación y autorización: access JWT verificado criptográficamente + sesión autoritativa, roles
por guard, y service JWT en las cuatro rutas internas, con orden de guards y sin filtrar tokens. No existe aún
la estrategia Passport ni los guards productivos (AUTH-069); tampoco los controladores de sesión (AUTH-071).

## Cambios realizados

| Archivo | Cambio | Motivo |
|---|---|---|
| `apps/auth-service/test/helpers/reference-authentication.ts` | **Nuevo**. `ReferenceAccessTokenGuard` (verifica JWT con `TOKEN_SIGNER` y luego la sesión con `VALIDATE_SESSION_USE_CASE`, preservando 503) y `ReferenceRolesGuard` (metadata + principal validado). | No existe Passport/roles guard productivos; la referencia codifica D06 y AUTH-069 la sustituye. |
| `apps/auth-service/test/helpers/crypto-fixture.ts` | Se añaden `issueAccessToken` y `issueOutboundServiceToken` (RSA efímeras). | Emitir user JWT y token outbound en las pruebas. |
| `apps/auth-service/test/security/authentication-authorization.spec.ts` | **Nuevo**. 41 pruebas con controlador solo de test (`AccessTokenGuard`+`RolesGuard`) y cuatro rutas internas con `ServiceAuthGuard` real. | Matriz de autenticación/autorización. |

`auth-app.ts` no requirió cambios. No se modificó código productivo.

## Cobertura de la matriz

- **Access token (401):** sin bearer; firma foránea; `kid` desconocido; issuer/audience incorrectos; vencido;
  `alg:none`; `HS256`; token malformado; sesión desconocida/revocada; `sub` que no posee la sesión; `role` del
  claim distinto del rol de sesión. El negocio no se ejecuta.
- **Dependencia:** fallo de sesión → 503 preservado (no se convierte en 401).
- **Roles:** identidad válida sin el rol exigido → 403; rol permitido → 200 con el principal validado.
- **Principal no manipulable:** cabeceras `x-user-id`/`x-role` y campos de body no alteran el principal ni
  conceden rutas privilegiadas.
- **Service JWT (4 rutas internas):** token inbound válido → 200; ausente, user JWT, token outbound (Users),
  scope insuficiente, issuer/audience incorrectos o vencido → 401.
- **Order/observabilidad:** rechazo temprano conserva `x-trace-id`/`traceId` y el `problem` ni el log
  contienen el bearer.
- **Rotación de claves:** token firmado con una clave previa aún en el anillo → 200; al retirarla → 401.

## Evidencia de comandos

```sh
npm run typecheck   # OK
npm run lint        # OK
npm run test --workspace @stayhub/auth-service -- --selectProjects security \
  --runTestsByPath test/security/authentication-authorization.spec.ts   # 41/41
```

Proyecto de seguridad completo: **2 suites, 46 tests, 0 fallos**.

## Criterios de aceptación

- [x] 401 y 403 se distinguen por causa real (firma/sesión vs rol).
- [x] JWT y key rings reales para los casos criptográficos; guards con orden correcto.
- [x] No se añadió capacidad administrativa ni rutas productivas fuera de alcance (test-only).

## Pendiente / handoff

- **AUTH-069:** sustituir los guards de referencia por `AccessTokenGuard`/`RolesGuard`/`jwt.strategy` productivos
  con `@nestjs/passport`, y re-ejecutar esta suite.
- **AUTH-071:** sustituir el controlador fixture de las cuatro rutas por los controladores reales.
- **AUTH-083:** correlación/telemetría de span (aquí solo se comprueba `traceId` y no-fuga en el log de error).
- Sin bloqueos de infraestructura.
