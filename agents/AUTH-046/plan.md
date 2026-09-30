# AUTH-046 — Componer módulos de registro y credenciales

Estado inicial: pendiente. Tipo: Composición Nest.

## Resultado esperado y evidencia

Todos los providers viven hoy en AppModule; no hay RegistrationModule/CredentialsModule y futuros módulos no heredan providers privados del raíz.

## Preparación

Leer [reglas compartidas](../decisiones.md): D01–D03, D07–D10, y [auditoría](../auditoria.md). Ejecutar desde la raíz del repositorio.

Dependencias: [AUTH-045](../AUTH-045/plan.md).

## Archivos concretos

- `apps/auth-service/src/modules/registration/registration.module.ts`
- `apps/auth-service/src/modules/credentials/credentials.module.ts`
- `apps/auth-service/src/app.module.ts`
- `apps/auth-service/src/modules/core/core.module.ts`
- `apps/auth-service/src/modules/service-auth/service-auth.module.ts`
- `apps/auth-service/test/integration/registration-module.spec.ts`

## Pasos de ejecución

1. CredentialsModule importa Prisma/Core, provee repositorio Credential y hasher, exporta sus tokens. Evitar una segunda instancia de Argon2 que regenere hash señuelo innecesariamente.
2. RegistrationModule importa Credentials/Core/Prisma/ServiceAuth; provee RegistrationWork, adapter registro, policy factory, advance service, RegisterAccount y reconciliador mediante factories tipadas.
3. Registrar controlador AUTH-045 y scheduler AUTH-043; exportar solo puertos necesarios. AppModule importa módulos y elimina providers duplicados ya movidos.
4. Todavía no componer USERS_SERVICE completo con lookup inexistente: inyectar contrato de registro específico Pick<UsersServicePort,...> o token dedicado del adapter, documentado en PRE-004.
5. Bootstrapping de AppModule en test con dependencias test y stub Users: resolver todos los providers y ejecutar registro. Asegurar shutdown de reconciliador y Redis.

## Criterios de aceptación

- [ ] No UnknownDependenciesException ni instancias duplicadas de providers de estado.
- [ ] AppModule expone registro y health usando componentes productivos.
- [ ] Config/clock/uuid quedan disponibles por exports explícitos.

## Comprobación

```sh
npm run typecheck
npm run test --workspace @stayhub/auth-service -- --selectProjects integration --runTestsByPath test/integration/registration-module.spec.ts
```

No modificar Users/Gateway. Los contratos candidatos se prueban localmente; las tareas de integración externa certifican al proveedor real.

Al terminar, crear `agents/AUTH-046/resultado.md` con cambios, pruebas y bloqueos. No declarar como ejecutada una prueba pendiente de infraestructura. El estado del plan solo cambia cuando sus criterios se verifican.

