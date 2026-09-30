# AUTH-069 — Implementar Passport y guards de usuario

Estado inicial: pendiente. Tipo: Implementación autenticación/autorización.

## Resultado esperado y evidencia

Solo existe ServiceAuthGuard; package.json no incluye @nestjs/passport, passport ni una estrategia.

## Preparación

Leer [reglas compartidas](../decisiones.md): D01, D02, D04–D06, D08–D10, y [auditoría](../auditoria.md). Ejecutar desde la raíz del repositorio.

Dependencias: [AUTH-058](../AUTH-058/plan.md), [AUTH-068](../AUTH-068/plan.md).

## Archivos concretos

- `apps/auth-service/src/interfaces/http/auth/jwt.strategy.ts`
- `apps/auth-service/src/interfaces/http/guards/access-token.guard.ts`
- `apps/auth-service/src/interfaces/http/guards/roles.guard.ts`
- `apps/auth-service/src/interfaces/http/guards/roles.decorator.ts`
- `apps/auth-service/src/interfaces/http/auth/authenticated-principal.ts`
- `package.json`
- `package-lock.json`
- `apps/auth-service/package.json`
- `apps/auth-service/test/security/authentication-authorization.spec.ts`

## Pasos de ejecución

1. Añadir al workspace @nestjs/passport compatible Nest 10, passport y passport-custom (y tipos necesarios), fijar versiones exactas en lock. Usar estrategia custom que delega criptografía al TokenSigner existente; evita duplicar verificadores jose y passport-jwt.
2. Estrategia llamada access-jwt extrae bearer, verifyAccessToken, ValidateSession(sub,sid,exp) y exige role de claim igual al de sesión; forma principal tipado con UUID, role y exp.
3. AccessTokenGuard convierte rechazos criptográficos/sesión a 401, preserva 503 de dependencias; no convertir cualquier excepción a 401.
4. Roles decorator registra roles permitidos; guard lee metadata y request.user validado. Sin principal 401, principal sin rol requerido 403; ninguna cabecera de cliente otorga permisos.
5. Probar con controlador solo de test en AUTH-058; las cuatro rutas internas de Auth siguen ServiceAuthGuard, no reemplazarlo por access guard.
6. Exportar providers para composición AUTH-072; ejecutar security y typecheck con versiones instaladas.

## Criterios de aceptación

- [ ] Verificación criptográfica y sesión son ambas obligatorias para usuario.
- [ ] 401/403/503 conservan causa correcta.
- [ ] No se añade endpoint público/productivo de demostración.

## Comprobación

```sh
npm run typecheck
npm run test --workspace @stayhub/auth-service -- --selectProjects security --runTestsByPath test/security/authentication-authorization.spec.ts
```

Mantener expiración absoluta, rol inmutable y límites de Auth. No implementar cookie Gateway ni acceso a users_db.

Al terminar, crear `agents/AUTH-069/resultado.md` con cambios, pruebas y bloqueos. No declarar como ejecutada una prueba pendiente de infraestructura. El estado del plan solo cambia cuando sus criterios se verifican.
