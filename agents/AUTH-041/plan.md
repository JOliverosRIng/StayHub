# AUTH-041 — Implementar adapter Users para registro

Estado inicial: pendiente. Tipo: Implementación local; integración depende de G2.

## Resultado esperado y evidencia

UsersServiceClient solo transporta requests genéricos. El puerto declara cinco métodos pero no tiene provider. GET registro falta en contrato vigente.

## Preparación

Leer [reglas compartidas](../decisiones.md): D01–D03, D07–D10, y [auditoría](../auditoria.md). Ejecutar desde la raíz del repositorio.

Dependencias: [PRE-001](../PRE-001/plan.md), [PRE-004](../PRE-004/plan.md).

## Archivos concretos

- `apps/auth-service/src/infrastructure/http/users-registration.client.ts`
- `apps/auth-service/src/infrastructure/http/users-service.types.ts`
- `apps/auth-service/src/application/ports/users-service.port.ts`
- `apps/auth-service/test/contract/users-registration-adapter.spec.ts`

## Pasos de ejecución

1. Implementar métodos createPendingUser, getRegistration, activateRegistration, cancelRegistration sobre UsersServiceClient existente, con rutas D07. Retornar RegistrationIdentity, mapeando id→userId y preservando resumen solo en memoria.
2. Validar respuestas en runtime: UUID, role permitido, strings name/email, status allowlist y coincidencia con registro/usuario esperado cuando se conoce. Respuesta mal formada → DependencyUnavailableError.
3. Propagar traceId, service JWT y key de registro. create es idempotente por registrationId; GET y activate/cancel permiten retries. Nunca enviar password/hash/tokens de usuario.
4. Mapear get 404 a null; create 409 a conflicto seguro; cancel 409 debe distinguirse para consultar estado en la saga; timeout/circuito abierto/5xx/service 401/403 a dependencia no disponible.
5. Probar requests/responses con HTTP stub, no mocks de fetch. Marcar expresamente GET como candidato de PRE-004; no afirmar conformidad provider hasta AUTH-076.
6. No implementar todavía resolveLoginIdentity ni un segundo transporte. AUTH-063 añadirá el adapter de lookup; AUTH-072 compondrá ambos bajo USERS_SERVICE.

## Criterios de aceptación

- [ ] Payload hacia Users contiene solo campos del PendingUserCommand.
- [ ] Errores y respuestas extrañas no avanzan saga.
- [ ] GET candidato queda identificado y tests locales pasan.

## Comprobación

```sh
npm run typecheck
npm run test --workspace @stayhub/auth-service -- --selectProjects contract --runTestsByPath test/contract/users-registration-adapter.spec.ts
```

No modificar Users/Gateway. Los contratos candidatos se prueban localmente; las tareas de integración externa certifican al proveedor real.

Al terminar, crear `agents/AUTH-041/resultado.md` con cambios, pruebas y bloqueos. No declarar como ejecutada una prueba pendiente de infraestructura. El estado del plan solo cambia cuando sus criterios se verifican.

