# Task 06 — Contratos y flujos funcionales completos

Estado inicial: PENDIENTE.
Origen: Fase D2: INT-01–12 e INT-16 del plan de integración.
Dependencia: task-05 completa; leer también los resultados anteriores acumulados.
Resultado: `agents/integracion/task-06/resultado.md`.

## Antes de ejecutar

Leer [reglas comunes](../CONTEXTO.md) y el [índice](../PLAN.md).
Comprobar el estado real del código y preservar cambios existentes. Ejecutar solo esta tarea.

## Alcance específico y secuencia

Reutilizar exclusivamente el harness real de task-05. Implementar las suites de contratos y las suites cross-service de registro, login y perfil previstas en D1. Escribir pruebas del comportamiento antes de corregir incompatibilidades productivas. Las correcciones deben ser acotadas y respetar CONTEXTO.md. No sustituir clientes productivos por dobles para lograr el verde.

## Escenarios obligatorios de esta tarea

| ID | Escenario | Resultado exigido |
|---|---|---|
| INT-01 | Registro completo vía Auth, GUEST y OWNER | 201; GET Users ACTIVE; login posterior válido |
| INT-02 | Repetir registro con misma key y payload | Misma identidad, sin duplicación |
| INT-03 | Misma key con payload distinto | 409; identidad original intacta |
| INT-04 | Correo equivalente ya registrado | 409; cuenta original intacta |
| INT-05 | Dos registros simultáneos con misma key | Una identidad; conflicto transitorio permitido según contrato, reintento converge al mismo resultado |
| INT-06 | Login con correo normalizado | 200; tokens emitidos por Auth |
| INT-07 | Contraseña incorrecta, usuario ausente, PENDING o CANCELLED | 401 genérico, sin sesión utilizable |
| INT-08 | Lookup real | Exactamente userId/role/status ACTIVE; ausencia y no activo indistinguibles |
| INT-09 | Token de login → GET/PATCH perfil | 200 para dueño; PATCH multipart con expectedVersion |
| INT-10 | Cambiar email del perfil | Nuevo correo permite login; anterior devuelve 401 |
| INT-11 | Perfil de otro usuario con JWT válido | 403 y sin cambios |
| INT-12 | Refresh y reutilización | Rotación exitosa; replay 401; validación de sesión en Auth después del replay devuelve 401 |
| INT-16 | JWT de servicio con scope/clave incorrectos | 403/401 respectivamente en Users |

Para INT-07, crear identidades PENDING/CANCELLED mediante las rutas internas de Users
con un token de servicio autorizado. No agregar endpoints productivos de test. 

El PATCH de perfil es multipart/form-data con campo JSON `profile` y `expectedVersion`; obtener la versión actual con GET. Usar el accessToken devuelto por login real. No sustituirlo por un token de fixture para los casos positivos.

Las pruebas pueden inspeccionar sus bases desechables para comprobar invariantes; Auth productivo nunca consulta users_db. Después del replay, comprobar revocación en Auth. No exigir rechazo del JWT revocado mediante acceso directo a Users: ese control pertenece al Gateway.

## Criterio de cierre de esta tarea

INT-01–12 e INT-16 verdes con servicios reales, más el smoke de task-05. Registrar cada escenario con archivo/prueba y resultado. INT-13–15 e INT-17 pertenecen a task-07.

Guardar el resultado usando el formato de CONTEXTO.md y actualizar la fila task-06 del índice. Dejar el contexto necesario para task-07, sin ejecutarla.
