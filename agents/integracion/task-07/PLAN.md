# Task 07 — Recuperación, fallos y reinicios

Estado inicial: PENDIENTE.
Origen: Fase D2: INT-13–15 e INT-17 del plan de integración.
Dependencia: task-06 completa; leer también los resultados anteriores acumulados.
Resultado: `agents/integracion/task-07/resultado.md`.

## Antes de ejecutar

Leer [reglas comunes](../CONTEXTO.md) y el [índice](../PLAN.md).
Comprobar el estado real del código y preservar cambios existentes. Ejecutar solo esta tarea.

## Alcance específico y secuencia

Extender las suites de task-06 y los helpers de task-05; no crear un segundo harness independiente. Escribir primero reproducciones de fallos, corregir solo problemas demostrados y volver a ejecutar los escenarios funcionales afectados. La comprobación de reinicio puede automatizarse en una suite adicional explícitamente incluida en la configuración dedicada.

## Escenarios obligatorios de esta tarea

| ID | Escenario | Resultado exigido |
|---|---|---|
| INT-13 | Users inaccesible durante registro/login | 503 seguro; no confirmar registro parcial |
| INT-14 | Users confirma una escritura pero Auth pierde la respuesta | Reintento con misma key converge sin duplicar ni cancelar usuario ACTIVE |
| INT-15 | Reconciliación de registro interrumpido | Converge a completo o cancelado de acuerdo con estado/TTL; no queda abandonado por falta del GET |
| INT-17 | Reiniciar servicios del entorno integrado | Usuario persiste y puede volver a iniciar sesión |

Para INT-14 usar un proxy de fallos en el harness que reenvíe a Users real y descarte
la respuesta seleccionada después de la escritura. Ese proxy no debe fabricar
usuarios ni respuestas de negocio. Si Auth reintenta automáticamente, definir con
precisión cuántas respuestas descartar para observar la recuperación deseada.

Para INT-15 reutilizar inyección de reloj/configuración en tests o preparar estado
en la base desechable de Auth desde el harness; no esperar 15 minutos por defecto.
Incluir el caso de interrupción anterior a crear la identidad en Users: cancelar
un registro remoto ausente hoy devuelve 404 y el cliente Auth lo convierte en
dependencia no disponible. Verificar si esto deja COMPENSATING indefinidamente.
Si la prueba lo demuestra, corregir acotadamente Auth para tratar la ausencia
confirmada en cancelación como objetivo remoto ya satisfecho, conservando errores
401/403/5xx como fallos y protegiendo la carrera con una creación tardía. No aceptar
una solución que deje un usuario ACTIVE con credencial revocada. Registrar el caso
y la decisión; si exige un protocolo nuevo, describir el bloqueo antes de ampliar alcance.

Las pruebas pueden inspeccionar sus bases desechables para comprobar invariantes.
El código productivo de Auth nunca consulta directamente `users_db`.

No exigir que el JWT de una sesión revocada sea rechazado por un acceso directo a
Users: ese rechazo depende del Gateway, fuera del alcance confirmado por el usuario.
Sí exigir que Auth declare inválida la sesión tras replay.

## Criterio de cierre de esta tarea

INT-13–15 e INT-17 verdes y regresión conjunta INT-01–17 sin fallos. Documentar pérdidas de respuesta, límites de retry, estados antes/después y ausencia de identidades activas con credenciales revocadas. Si un caso exige un nuevo protocolo, registrar el bloqueo y no marcar esta tarea completa.

Guardar el resultado usando el formato de CONTEXTO.md y actualizar la fila task-07 del índice. Dejar el contexto necesario para task-08, sin ejecutarla.
