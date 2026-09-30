# PRE-004 — Fijar contratos entre Auth, Users y Gateway

Estado inicial: pendiente. Tipo: Preparación; contrato candidato con dependencia G2/G1.

## Resultado esperado y evidencia

OpenAPI Users no contiene GET de registro; UserSummary usa id y el puerto usa userId. OpenAPI Auth sí devuelve name/email en registro. La introspección recibe sessionId/userId, sin JWT ni exp. Puerto público 8443 del contrato difiere de 8080 del plan.

## Preparación

Leer [reglas compartidas](../decisiones.md): D02, D03, D06, D07, y [auditoría](../auditoria.md). Ejecutar desde la raíz del repositorio.

Dependencias: ninguna; puede comenzar con la revisión actual.

## Archivos concretos

- `agents/contrato-users-candidato.md (nuevo al ejecutar)`
- `apps/auth-service/src/application/ports/users-service.port.ts`
- `apps/auth-service/src/application/ports/auth-use-cases.port.ts (nuevo)`
- `apps/auth-service/src/application/errors/auth-errors.ts`
- `specs/001-fundamentos-identidad/contracts/openapi-users-service.yaml (lectura; actualización solo coordinada)`
- `specs/001-fundamentos-identidad/contracts/openapi-auth-service.yaml (lectura)`
- `specs/001-fundamentos-identidad/contracts/openapi-public.yaml (lectura)`

## Pasos de ejecución

1. Documentar GET /internal/v1/registrations/{registrationId}, response UserSummary y errores según D07 como propuesta para G2; registrar estado PENDIENTE, dueño G2 y tareas afectadas. No representar la propuesta como contrato vigente.
2. Separar RegistrationIdentity con userId/name/email/role/status de LoginIdentity mínimo. Ajustar firmas create/get/activate del puerto; cancel retorna void. Ningún dato personal nuevo se persiste.
3. Definir tipos de entrada/salida e interfaces execute para RegisterAccount, Login, RotateRefresh y ValidateSession según D02/D03/D05/D06. Deben ser tipos de aplicación sin decoradores ni framework y permitir tests con dobles tipados.
4. Definir errores públicos de registro: REGISTRATION_CONFLICT, REGISTRATION_CANCELLED; mantener IdempotencyConflictError. Mapper HTTP asignará 409 en AUTH-042/045. Conflictos remotos no propagan texto sensible.
5. Dejar explícita la excepción de name/email en respuesta de registro y tokens en éxito login/refresh. Resolver normalización antes de validación y fingerprint, password exacta.
6. Registrar que validación HTTP actual no recibe exp: deshabilitar caché positiva en ese camino según D06. Registrar puerto Gateway como variable GATEWAY_BASE_URL hasta acuerdo G1, sin editar contrato público.
7. Fijar contrato candidato del stub para poder continuar localmente. La aceptación externa se documentará en AUTH-076/078; no detener implementación local por esa aprobación pendiente.

## Criterios de aceptación

- [ ] Los cuatro execute tienen entradas/salidas explícitas compatibles con OpenAPI Auth.
- [ ] Hay mapping explícito id→userId sin pérdida del resumen de registro.
- [ ] La ruta GET faltante y aceptación externa pendiente están visibles; no se atribuye implementación a G2.

## Comprobación

```sh
npm run typecheck (cuando PRE-001 haya instalado el toolchain)
```

No cambiar servicios ni contrato público de otros equipos unilateralmente.

Al terminar, crear `agents/PRE-004/resultado.md` con cambios, pruebas y bloqueos. No declarar como ejecutada una prueba pendiente de infraestructura. El estado del plan solo cambia cuando sus criterios se verifican.

