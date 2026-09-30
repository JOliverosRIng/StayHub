# Task 05 — Harness de integración sin Gateway

Estado inicial: PENDIENTE.
Origen: Fase D1 del plan de integración.
Dependencia: task-04 completa; leer también los resultados anteriores acumulados.
Resultado: `agents/integracion/task-05/resultado.md`.

## Antes de ejecutar

Leer [reglas comunes](../CONTEXTO.md) y el [índice](../PLAN.md).
Comprobar el estado real del código y preservar cambios existentes. Ejecutar solo esta tarea.

## Alcance específico y secuencia

Añadir un test de smoke real en `test/integration/auth-users-smoke.spec.ts` y añadirlo explícitamente a la configuración dedicada. Debe comprobar readiness de ambos servicios, un registro a través de Auth y login de ese usuario. No crear suites vacías para las rutas previstas: task-06 y task-07 añadirán los escenarios restantes. Documentar el comando raíz `npm run test:auth-users`, las variables necesarias, aprovisionamiento aislado y limpieza. El comando debe funcionar con las suites que ya existen y fallar claramente si faltan dependencias.

### D1. Harness independiente de Gateway

Crear una configuración dedicada, por ejemplo
`apps/auth-service/jest.auth-users.config.ts`, y un comando raíz
`test:auth-users` que la ejecute mediante el workspace Auth.

Configurar explícitamente estas suites nuevas (no depender de que Jest las descubra):

- `test/contract/users-registration.consumer.spec.ts`.
- `test/contract/users-login-identity.consumer.spec.ts`.
- `test/integration/cross-service-registration.spec.ts`.
- `test/integration/cross-service-login.spec.ts`.
- `test/integration/cross-service-profile.spec.ts`.

Reutilizar helpers existentes de forma controlada. Si esas rutas también quedan
incluidas en el Jest ordinario, excluirlas de las suites aisladas y documentar el
comando separado. Conservar su ejecución explícita en el comando nuevo.
No exigir `CROSS_SERVICE_GATEWAY_URL` para estas pruebas. No debilitar los requisitos
de suites que sí prueban Gateway. No usar `skip`, un retorno temprano ni un stub
para convertir dependencias ausentes en un resultado verde.

Usar ambos servicios reales por HTTP, sus migraciones reales, PostgreSQL 16 y Redis.
Preferir procesos separados o contenedores para evitar colisiones de aliases,
clientes Prisma y estrategias Passport entre las dos aplicaciones.

Separar completamente los datos de estas pruebas de los datos del desarrollador:

- Auth: base desechable terminada en `_test` si se usa su helper de limpieza;
  Redis DB 15 dedicado; `AUTH_TEST_ALLOW_CLEANUP=true` solo sobre esos destinos.
- Users exige base llamada `users_db`: usar instancia desechable propia o schema
  de pruebas único, siguiendo su harness. No renombrar la base para evadir validadores.
- El harness registra qué recursos creó y limpia exclusivamente esos recursos.
- Fijar timeout suficiente para builds/migraciones en hooks de arranque, sin
  aumentar indiscriminadamente los timeouts HTTP productivos para ocultar fallos.
- Generar identidades sintéticas `example.test` y UUID únicos por escenario.

## Criterio de cierre de esta tarea

Smoke real verde mediante el comando nuevo, sin Gateway ni Users simulado. Bases/Redis aislados, error explícito ante dependencia ausente y limpieza limitada a recursos propios. Dejar instrucciones exactas reproducibles para las tareas siguientes.

Guardar el resultado usando el formato de CONTEXTO.md y actualizar la fila task-05 del índice. Dejar el contexto necesario para task-06, sin ejecutarla.
