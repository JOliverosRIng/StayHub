# Contexto y reglas comunes — integración Auth ↔ Users

Fecha: 2026-09-29. Destinatario: DeepSeek Flash.
Todas las rutas son relativas a la raíz de StayHub.

## Cómo ejecutar una tarea

Lee este archivo, `PLAN.md`, el plan de la tarea solicitada y los resultados de sus dependencias. Ejecuta **solo esa tarea** y termina el turno al entregar su resultado. No continúes automáticamente con la siguiente. No delegues ni abras agentes adicionales.

Mantén un resultado por tarea en `task-NN/resultado.md`. Usa los estados PENDIENTE, EN CURSO, COMPLETA o BLOQUEADA. COMPLETA requiere todos sus criterios de cierre. Ante fallo, registra evidencia y trabajo restante; no des por completa una prueba no ejecutada. Actualiza la fila correspondiente en PLAN.md.

Formato obligatorio del resultado:

1. Estado, fecha, commit base y versiones usadas.
2. Dependencias leídas y estado comprobado.
3. Archivos cambiados y decisiones tomadas.
4. Comandos, códigos de salida y resultados reales (sin secretos).
5. Escenarios acreditados y pendientes.
6. Recursos temporales creados y limpieza realizada.
7. Instrucciones exactas para la tarea siguiente: comandos, variables y rutas, sin valores secretos.

No crear resultados ficticios antes de ejecutar. Si hay archivos previos, conservar evidencia y añadir actualización. La falta de Gateway no bloquea estas tareas. Los cambios de código se realizan durante la ejecución posterior; esta división documental no acredita implementación.

Objetivo: el entorno de desarrollo de Auth debe utilizar el `users-service` real
para registro y resolución de identidad. Users debe aceptar los access JWT emitidos
por Auth usando su clave pública. Registro, login, perfil y refresh deben funcionar
entre ambos servicios con persistencia real y contratos compatibles.

El usuario confirmó que se usará Gateway. **No implementar introspección de sesión
en Users ni implementar Gateway.** La comprobación de sesión activa/revocada antes
de acceder a perfiles seguirá siendo responsabilidad del futuro Gateway, como
define `plan.md`. Las pruebas directas contra Users acreditan firma, claims y
ownership; no acreditan el control de revocación de sesión del borde. 

No pedir confirmación por decisiones que este documento ya resuelve. Si el código
cambió desde esta revisión, inspecciona la diferencia y adapta detalles locales
conservando el objetivo y los contratos. Una dependencia ausente debe registrarse
como bloqueo verificable, nunca como prueba aprobada.

## 2. Alcance y límites

Incluido:

1. Añadir consulta interna de registro por `registrationId` en Users.
2. Conectar los clientes productivos de Auth a Users real.
3. Alinear JWT de usuario y JWT de servicio mediante configuración coherente.
4. Sustituir Users simulado en el arranque habitual de desarrollo/Swagger.
5. Preparar pruebas Auth↔Users independientes de Gateway y ejecutarlas.
6. Actualizar documentación y evidencia de esta integración.

Fuera de alcance:

- Crear Gateway, rutas públicas, HTTPS de borde o cookies del navegador.
- Añadir login, emisión de JWT, contraseñas o sesiones a Users.
- Fusionar bases, acceder desde un servicio a las tablas del otro o compartir Prisma.
- Rediseñar la saga de registro para eliminar `getRegistration`.
- Cambiar políticas de contraseña, roles, expiración o permisos del perfil.
- Implementar JWKS, rotación múltiple de claves en Users o un nuevo servicio de claves.
- Actualizar versiones de dependencias sin una necesidad demostrada para este trabajo.
- Eliminar los dobles de Users de pruebas unitarias o aisladas de Auth.
- Hacer commits, push, reset o limpieza de datos existentes sin solicitud del usuario.

Los límites por grupo de los documentos históricos describen el reparto original.
Esta tarea autoriza cambios coordinados en Auth, Users y su infraestructura compartida.
No exige realizar las tareas de Gateway para cerrar la integración de estos dos servicios.

## 3. Lecturas y comprobaciones iniciales

Lee las instrucciones `AGENTS.md` que resulten aplicables, si existen. Después:

- `specs/001-fundamentos-identidad/spec.md`.
- `specs/001-fundamentos-identidad/plan.md`, especialmente seguridad e integración.
- `specs/001-fundamentos-identidad/tasks/tasks_userService.md`, USR-071–078.
- `specs/001-fundamentos-identidad/tasks/tasks_authService.md`, AUTH-076–084.
- `apps/users-service/REVALIDACION.md`.
- `agents/result/README.md`, `agents/result/bloque-3.md`, `agents/result/bloque-4.md`.
- `agents/contrato-users-candidato.md`.
- Ambos OpenAPI internos en `specs/001-fundamentos-identidad/contracts/`.
- Los archivos de código indicados en las fases siguientes.

Ejecuta `git status --short`, comprueba Node/npm y dependencias instaladas. El
proyecto declara Node 20. Registra cualquier diferencia de versión usada al verificar.
No leas ni imprimas secretos de `.env` para incluirlos en resultados.

Observaciones de la revisión que debes confirmar:

- Ya existen `apps/auth-service` y `apps/users-service`.
- `agents/`, `guia/` y `guia-v2/` aparecían como no rastreados; son trabajo del usuario.
- Las casillas de `tasks.md` y ciertos bloqueos históricos están desactualizados.
  La existencia de código y los informes antiguos no sustituyen las pruebas actuales.
- No se ejecutaron pruebas durante la elaboración de este plan.

## 4. Estado técnico conocido

### Users

- `prisma/schema.prisma`: `User.registrationId` ya es UUID único.
- `application/ports/user.repository.ts`: `UserSummary` ya contiene
  `id`, `name`, `email`, `role`, `status`; el repositorio expone `create` y `transition`.
- `infrastructure/persistence/prisma/user.repository.ts`: ya existe proyección
  `summary`, pero falta consulta pública del repositorio por `registrationId`.
- `interfaces/http/internal/registration.controller.ts`: solo POST de creación,
  activación y cancelación; todos usan `ServiceAuthGuard` y scope `registration`.
- `interfaces/http/auth/jwt.strategy.ts`: valida JWT RS256 de usuario y claims.
- Users no emite tokens productivos. Sus firmantes de fixtures son solo de pruebas.

### Auth

- `infrastructure/http/users-registration.client.ts` ya llama al GET faltante y
  convierte `UserSummary.id` a `RegistrationIdentity.userId`.
- `application/registration/register-account.use-case.ts` usa ese GET también al
  construir la respuesta final y al repetir un registro completado.
- `advance-registration.service.ts` y `reconcile-registrations.use-case.ts` lo
  usan para observar el estado remoto y recuperar registros interrumpidos.
- `users-login-identity.client.ts` ya usa el endpoint real previsto por Users:
  `POST /internal/v1/login-identities/resolve`.
- `users-service.client.ts` ya aplica timeout, reintento idempotente y circuit breaker.
- `users-service-token.provider.ts` ya firma JWT de servicio RS256.
- `scripts/dev-auth-swagger.mjs` arranca `scripts/users-stub.mjs`; el Compose de
  desarrollo también incluye `users-stub`.

### Incompatibilidades confirmadas

- Falta el GET de registro en Users y en su OpenAPI.
- `.env.example` no alinea issuer/kid de access JWT entre servicios ni todos los
  parámetros de JWT de servicio.
- Auth usa `users:identity`; Users exige scopes distintos para registro y lookup.
- El generador `scripts/generate-auth-dev-env.mjs` apunta al stub y no genera la
  configuración completa de Users.
- El script nativo llama `npm run prisma:generate` en raíz, pero ese script raíz
  no existe; existen `prisma:auth:generate` y `prisma:users:generate`.
- El harness cross-service de Auth exige Gateway además de Users y referencia
  suites que no estaban implementadas. No lo presentes como integración ya lista.

## Comprobaciones compartidas

Las fuentes históricas se leen inicialmente en task-01. En sesiones posteriores, leer los resultados previos y las partes de esas fuentes pertinentes a la tarea; no asumir que casillas antiguas representan el estado real.

Los scripts `npm run dev:swagger` y `npm run dev:swagger:docker` deben conservar sus nombres. Su sustitución del stub se hace en task-03 y task-04, respectivamente. Las tareas 02–04 comparten configuración persistente: no generar claves independientes para cada servicio o modo. No eliminar dobles de pruebas aisladas.
