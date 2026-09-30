# AUTH-047 — Sincronizar OpenAPI de registro

Estado inicial: pendiente. Tipo: Contrato Auth.

## Resultado esperado y evidencia

OpenAPI estático contiene registro pero no 401 de service JWT ni schema completo de Problem; Swagger no contiene controlador de registro hoy.

## Preparación

Leer [reglas compartidas](../decisiones.md): D01–D03, D07–D10, y [auditoría](../auditoria.md). Ejecutar desde la raíz del repositorio.

Dependencias: [AUTH-046](../AUTH-046/plan.md).

## Archivos concretos

- `apps/auth-service/src/interfaces/openapi/openapi.factory.ts`
- `apps/auth-service/src/interfaces/http/registration.controller.ts`
- `apps/auth-service/src/interfaces/http/dto/register.request.ts`
- `apps/auth-service/src/interfaces/http/dto/register.response.ts`
- `apps/auth-service/src/interfaces/http/dto/problem.response.ts`
- `specs/001-fundamentos-identidad/contracts/openapi-auth-service.yaml`

## Pasos de ejecución

1. Exportar documento usando composición real y comparar operación orchestrateRegistration con YAML.
2. Añadir 401, describir normalización name/email y password exacta; conservar key UUID, role de request GUEST/OWNER y respuesta id/name/email/role.
3. Declarar Problem DTO con instance/errors opcional según mapper y cerrar request adicionalProperties:false en schema generado; no confiar en whitelist para documentar cierre.
4. Estabilizar nombres de schemas o preparar equivalencia estructural para AUTH-075. Mantener operationId y serviceAuth iguales.
5. Ejecutar sintaxis OpenAPI y suite AUTH-026, que debe validar respuestas contra el contrato.

## Criterios de aceptación

- [ ] Swagger y YAML describen mismos campos, límites y 201/400/401/409/503.
- [ ] Cambios limitados al contrato Auth; no se alteran rutas públicas.
- [ ] La respuesta solo documenta id/name/email/role; name/email están permitidos por el contrato y no se incluyen contraseñas, hashes ni tokens.

## Comprobación

```sh
npm run openapi:check
npm run test --workspace @stayhub/auth-service -- --selectProjects contract --runTestsByPath test/contract/registration.contract.spec.ts
npm run typecheck
```

No modificar Users/Gateway. Los contratos candidatos se prueban localmente; las tareas de integración externa certifican al proveedor real.

Al terminar, crear `agents/AUTH-047/resultado.md` con cambios, pruebas y bloqueos. No declarar como ejecutada una prueba pendiente de infraestructura. El estado del plan solo cambia cuando sus criterios se verifican.
