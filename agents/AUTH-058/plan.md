# AUTH-058 — Pruebas de guards, roles y service JWT

Estado inicial: pendiente. Tipo: Pruebas de seguridad.

## Resultado esperado y evidencia

Hay ServiceAuthGuard pero no Passport strategy ni roles guard; traceId actual del interceptor era posterior al guard.

## Preparación

Leer [reglas compartidas](../decisiones.md): D01, D02, D04–D06, D08–D10, y [auditoría](../auditoria.md). Ejecutar desde la raíz del repositorio.

Dependencias: [PRE-001](../PRE-001/plan.md), [AUTH-053](../AUTH-053/plan.md).

## Archivos concretos

- `apps/auth-service/test/security/authentication-authorization.spec.ts`
- `apps/auth-service/test/helpers/crypto-fixture.ts`
- `apps/auth-service/test/helpers/auth-app.ts`

## Pasos de ejecución

1. Montar controlador exclusivamente de test con AccessTokenGuard y RolesGuard; no agregar rutas de demostración productivas.
2. Probar ausencia, expiración, manipulación, alg inválido, issuer/aud/kid incorrectos:401; identidad válida rol no permitido 403; permitido 200. Orden de guards debe impedir revelar metadata/ejecutar negocio antes de autenticación.
3. Probar JWT válido de usuario con sid revocada/mismatch sub/role frente DB:401; cambiar headers x-user-id/x-role o campos body no altera principal.
4. Probar service JWT en cuatro rutas internas: access JWT no sustituye service JWT; token outbound Users no válido inbound Auth; scope insuficiente 401 conforme guard actual.
5. Verificar rotación de claves y que log/Problem no filtra token. Rechazo temprano conserva mismo traceId en header/body/log.
6. Reejecutar tras AUTH-069/071. Las rutas de prueba se quedan solo en test.

## Criterios de aceptación

- [ ] 401 y 403 distinguidos por causa real y no por status simulado.
- [ ] JWT y key rings reales para casos criptográficos; guards productivos.
- [ ] No se añade capacidad administrativa fuera de alcance.

## Comprobación

```sh
npm run typecheck
npm run test --workspace @stayhub/auth-service -- --selectProjects security --runTestsByPath test/security/authentication-authorization.spec.ts
```

Mantener expiración absoluta, rol inmutable y límites de Auth. No implementar cookie Gateway ni acceso a users_db.

Al terminar, crear `agents/AUTH-058/resultado.md` con cambios, pruebas y bloqueos. No declarar como ejecutada una prueba pendiente de infraestructura. Registrar RED esperado antes de implementar y GREEN después; el cierre funcional pertenece al plan de verificación de la historia.
