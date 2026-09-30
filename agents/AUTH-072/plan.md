# AUTH-072 — Componer Login, Sessions, Tokens y adapters

Estado inicial: pendiente. Tipo: Composición Nest.

## Resultado esperado y evidencia

AppModule inicial contiene providers base privados; faltan módulos funcionales y bindings USERS_SERVICE/ENTROPY.

## Preparación

Leer [reglas compartidas](../decisiones.md): D01, D02, D04–D06, D08–D10, y [auditoría](../auditoria.md). Ejecutar desde la raíz del repositorio.

Dependencias: [AUTH-046](../AUTH-046/plan.md), [AUTH-071](../AUTH-071/plan.md).

## Archivos concretos

- `apps/auth-service/src/modules/login/login.module.ts`
- `apps/auth-service/src/modules/sessions/sessions.module.ts`
- `apps/auth-service/src/modules/tokens/tokens.module.ts`
- `apps/auth-service/src/modules/service-auth/service-auth.module.ts`
- `apps/auth-service/src/infrastructure/http/users-service.adapter.ts`
- `apps/auth-service/src/app.module.ts`
- `apps/auth-service/test/integration/auth-modules.spec.ts`

## Pasos de ejecución

1. TokensModule provee signer, refresh codec y issuer factory, importa Core. SessionsModule provee UoW/repositories, rotate/validate factories, guards/strategy y SessionsController.
2. LoginModule importa Credentials/Sessions/Tokens/ServiceAuth y registra limiter+LoginUseCase+LoginController. Core exporta los recursos compartidos, sin duplicar Redis ni Clock.
3. Crear UsersServiceAdapter que implementa USERS_SERVICE delegando registro a AUTH-041 y lookup a AUTH-063. Si módulos solo necesitan Pick de puerto, exportar aliases useExisting sin nuevas instancias.
4. Mover providers restantes de AppModule a módulos propietarios; mantener HealthModule, OpenApiModule y scheduler únicos. Evitar ciclos: issuer no depende Login/SessionsModule; UoW lo consume el caller.
5. Crear test de AppModule completo con config test/DB/Redis/Users stub: register→login→validate→refresh→replay→validate 401.
6. Al cerrar app no debe quedar conexión/timer; prueba init falla por config faltante y readiness hasta migraciones actuales.

## Criterios de aceptación

- [ ] Cuatro handlers y health resuelven DI real.
- [ ] No hay ciclos ni providers duplicados de estado.
- [ ] Recorrido completo con replay pasa con dependencias reales de Auth.

## Comprobación

```sh
npm run typecheck
npm run test --workspace @stayhub/auth-service -- --selectProjects integration --runTestsByPath test/integration/auth-modules.spec.ts
```

Mantener expiración absoluta, rol inmutable y límites de Auth. No implementar cookie Gateway ni acceso a users_db.

Al terminar, crear `agents/AUTH-072/resultado.md` con cambios, pruebas y bloqueos. No declarar como ejecutada una prueba pendiente de infraestructura. El estado del plan solo cambia cuando sus criterios se verifican.
