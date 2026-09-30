# Task 01 — GET de registro en Users

Estado inicial: PENDIENTE.
Origen: Fase A del plan de integración.
Dependencia: ninguna.
Resultado: `agents/integracion/task-01/resultado.md`.

## Antes de ejecutar

Leer [reglas comunes](../CONTEXTO.md) y el [índice](../PLAN.md).
Comprobar el estado real del código y preservar cambios existentes. Ejecutar solo esta tarea.

## Alcance específico y secuencia

Esta tarea incluye las pruebas dirigidas de Users y su OpenAPI. Prepara únicamente las dependencias aisladas necesarias para esas pruebas; el harness conjunto se implementa en task-05. No conectar todavía el lanzador de desarrollo.

## 5. Fase A — GET de registro en Users

### A1. Contrato exacto

```text
GET /internal/v1/registrations/{registrationId}
Authorization: Bearer <JWT de servicio emitido por Auth>
Scope requerido: users:registration
```

`registrationId` es el UUID de la operación; no es el `userId`.
Validarlo con `RegistrationId.parse`, respetando el formato canónico existente.

Respuesta 200: exactamente el `UserSummary` ya utilizado por crear/activar:

```json
{
  "id": "11111111-1111-4111-8111-111111111111",
  "name": "Usuario de prueba",
  "email": "usuario@example.test",
  "role": "GUEST",
  "status": "PENDING"
}
```

- Devolver el estado actual: `PENDING`, `ACTIVE` o `CANCELLED`.
- Admitir los roles del modelo existente en la proyección; no habilitar registro ADMIN.
- No filtrar solo ACTIVE: Auth necesita observar los otros estados para reconciliar.
- No incluir teléfono, preferencias, foto, credenciales, tokens ni campos adicionales.
- Consultar esta ruta no activa, cancela ni modifica registros.
- Errores: UUID inválido 400, JWT inválido/ausente 401, scope insuficiente 403,
  registro ausente 404, base no disponible 503.
- Conservar Problem Details y `traceId` existentes.
- Autenticación y scope se evalúan antes de consultar la base.

### A2. Cambios por archivo

1. `apps/users-service/src/application/ports/user.repository.ts`:
   añadir `findByRegistrationId(registrationId: string): Promise<UserSummary | null>`.
2. `apps/users-service/src/infrastructure/persistence/prisma/user.repository.ts`:
   implementar búsqueda única por `registrationId` con proyección de los cinco campos.
   Devolver `null` solo cuando no existe; no convertir errores de BD en ausencia.
3. Crear `apps/users-service/src/application/registration/get-registration.use-case.ts`:
   clase `GetRegistration`, recibe `UserRepository`, valida el UUID y devuelve resumen;
   si el repositorio devuelve null, lanzar `DomainError('NOT_FOUND')`.
4. `apps/users-service/src/interfaces/http/internal/registration.controller.ts`:
   inyectar el caso de uso y añadir `@Get(':registrationId')`, heredando guard/scope.
   El controlador solo delega; no accede a Prisma.
5. `apps/users-service/src/modules/registration-state.module.ts`:
   registrar el caso de uso con la misma fábrica/inyección que los otros tres.
6. `apps/users-service/src/interfaces/openapi/registration.openapi.ts`:
   añadir decorador `RegistrationGetApi`, `operationId: getRegistration`, parámetro
   UUID, resumen existente y respuestas 200/400/401/403/404/503.
7. Actualizar `specs/001-fundamentos-identidad/contracts/openapi-users-service.yaml`
   con el Swagger generado; no modificar otras operaciones salvo drift demostrado.
8. Ajustar dobles tipados de `UserRepository` que necesiten el nuevo método.

No cambiar esquema ni generar migraciones: el índice único ya existe.

### A3. Pruebas obligatorias

Añadir primero casos a `test/contract/registration.contract.spec.ts` y a las suites
de seguridad/integración de Users que correspondan. Usar el harness PostgreSQL existente.

- Crear PENDING por HTTP y consultar: 200, proyección exacta, estado PENDING.
- Activar por HTTP y consultar: ACTIVE.
- Crear otro registro, cancelar y consultar: CANCELLED.
- UUID válido inexistente: 404; UUID mal formado: 400.
- JWT ausente, expirado o firmado con clave ajena: 401.
- Token válido con solo scope de lookup: 403.
- Fallos de autenticación/scope no llaman al repositorio de consulta.
- Lecturas repetidas no alteran `updatedAt`, estado ni otros datos persistidos.
- Indisponibilidad de persistencia produce 503, nunca 404 ni respuesta de éxito.

Verificar el rechazo esperado antes de implementar y el resultado verde después.
No hace falta mutar producción para demostrarlo: la ruta ausente ya produce el fallo inicial.

## Criterio de cierre de esta tarea

GET y casos A3 verdes; typecheck/lint/build de Users y validación OpenAPI sin drift. Registrar evidencia de fallo inicial y aprobación posterior.

Guardar el resultado usando el formato de CONTEXTO.md y actualizar la fila task-01 del índice. Dejar el contexto necesario para task-02, sin ejecutarla.
