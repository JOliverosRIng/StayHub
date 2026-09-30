# AUTH-045 — Exponer controlador interno de registro

Estado inicial: pendiente. Tipo: Implementación HTTP.

## Resultado esperado y evidencia

RegisterRequest/Response existen, pero no hay RegistrationController. ValidationPipe no normaliza email/name.

## Preparación

Leer [reglas compartidas](../decisiones.md): D01–D03, D07–D10, y [auditoría](../auditoria.md). Ejecutar desde la raíz del repositorio.

Dependencias: [AUTH-026](../AUTH-026/plan.md), [AUTH-042](../AUTH-042/plan.md), [AUTH-043](../AUTH-043/plan.md).

## Archivos concretos

- `apps/auth-service/src/interfaces/http/registration.controller.ts`
- `apps/auth-service/src/interfaces/http/dto/register.request.ts`
- `apps/auth-service/src/interfaces/http/dto/register.response.ts`
- `apps/auth-service/src/interfaces/http/problem.mapper.ts`
- `apps/auth-service/test/contract/registration.contract.spec.ts`

## Pasos de ejecución

1. Crear @Controller('internal/v1/registrations'), @Post(), status 201 y ServiceAuthGuard. Validar Idempotency-Key UUID con pipe dedicado o ParseUUIDPipe; extraer traceId del middleware.
2. Añadir Transform protegido por typeof string para trim(name), trim(email) antes de validadores; normalización lowercase canónica permanece en caso de uso. No transformar password.
3. Inyectar execute por token de aplicación/factory definido en PRE-004/AUTH-046; pasar input y key. Retornar DTO explícito id/name/email/role sin snapshot de Registration/Credential.
4. Documentar operationId orchestrateRegistration, serviceAuth, header requerido, schemas y respuestas 201/400/401/409/503. El enum response debe ser compatible con Role del contrato, aunque registro nuevo solo acepte GUEST/OWNER.
5. Ejecutar AUTH-026 y AUTH-033; no añadir cookies, JWT ni rutas públicas al controlador.

## Criterios de aceptación

- [ ] Endpoint sirve 201 y todos los errores contractuales usando guard/pipe reales.
- [ ] Correo/nombre válidos con espacios exteriores funcionan; contraseña sigue exacta.
- [ ] Controlador solo traduce HTTP y ejecuta el caso de uso.

## Comprobación

```sh
npm run typecheck
npm run test --workspace @stayhub/auth-service -- --selectProjects contract --runTestsByPath test/contract/registration.contract.spec.ts
```

No modificar Users/Gateway. Los contratos candidatos se prueban localmente; las tareas de integración externa certifican al proveedor real.

Al terminar, crear `agents/AUTH-045/resultado.md` con cambios, pruebas y bloqueos. No declarar como ejecutada una prueba pendiente de infraestructura. El estado del plan solo cambia cuando sus criterios se verifican.
