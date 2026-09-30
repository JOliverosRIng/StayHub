# AUTH-066 — Preparar y firmar pares de tokens

Estado inicial: pendiente. Tipo: Implementación emisión.

## Resultado esperado y evidencia

Session/RefreshToken y firmante existen; ENTROPY_GENERATOR estaba sin provider; no hay emisor que genere refresh/HMAC y unifique expiraciones.

## Preparación

Leer [reglas compartidas](../decisiones.md): D01, D02, D04–D06, D08–D10, y [auditoría](../auditoria.md). Ejecutar desde la raíz del repositorio.

Dependencias: [PRE-003](../PRE-003/plan.md), [AUTH-053](../AUTH-053/plan.md).

## Archivos concretos

- `apps/auth-service/src/application/sessions/issue-session-tokens.service.ts`
- `apps/auth-service/src/application/ports/refresh-token-codec.port.ts`
- `apps/auth-service/src/infrastructure/security/hmac-refresh-token.codec.ts`
- `apps/auth-service/test/unit/issue-session-tokens.spec.ts`

## Pasos de ejecución

1. Crear RefreshTokenCodec port y adapter encode/hash con node:crypto en infraestructura; 32 bytes de entropía, base64url y HMAC secret existente. Application solo usa puerto.
2. IssueSessionTokensService prepara nueva sesión con UUID y Clock, llama Session.create con 604800 y prepara token con expiry exactamente igual.
3. Para refresh recibir Session existente; no recrearla ni consultar Users. Generar nuevos IDs token/jti y firmar access con rol/sub/sid de esa Session.
4. Retornar objetos dominio para UoW más rawRefreshToken/accessToken/response; el servicio no persiste fuera de la transacción del caller ni cachea secretos.
5. Agregar pruebas de entropía32, base64url, HMAC64 estable para mismo raw con secreto, tokens diferentes, exp 3600, boundary cerca del día7 y fallo de firma sin persistencia.
6. Mantener raw refresh solamente en resultado temporal; no poner writeOnly en DTO de respuesta que debe serializarse.

## Criterios de aceptación

- [ ] Refresh persiste únicamente HMAC y mantiene vencimiento absoluto original.
- [ ] Access proyecta claims mínimos y rol de sesión.
- [ ] Emisor usable tanto por login como por rotación sin duplicar reglas.

## Comprobación

```sh
npm run typecheck
npm run test --workspace @stayhub/auth-service -- --selectProjects unit --runTestsByPath test/unit/issue-session-tokens.spec.ts
```

Mantener expiración absoluta, rol inmutable y límites de Auth. No implementar cookie Gateway ni acceso a users_db.

Al terminar, crear `agents/AUTH-066/resultado.md` con cambios, pruebas y bloqueos. No declarar como ejecutada una prueba pendiente de infraestructura. El estado del plan solo cambia cuando sus criterios se verifican.
