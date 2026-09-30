# Integración Auth ↔ Users — ejecución tarea por tarea

Plan dividido para DeepSeek Flash. Estado inicial: **todas pendientes**.

Leer [CONTEXTO.md](CONTEXTO.md) y ejecutar una sola carpeta por conversación, en el orden indicado. Cada tarea depende de la anterior y debe leer su `resultado.md`; las decisiones acumuladas permanecen vigentes. No pasar automáticamente a la siguiente.

| Orden | Carpeta y plan | Entrega | Depende de | Estado |
|---|---|---|---|---|
| 01 | [task-01](task-01/PLAN.md) | GET de registro en Users | Ninguna | COMPLETA |
| 02 | [task-02](task-02/PLAN.md) | JWT y configuración persistente compartida | task-01 | COMPLETA |
| 03 | [task-03](task-03/PLAN.md) | Arranque nativo con Users real | task-02 | COMPLETA |
| 04 | [task-04](task-04/PLAN.md) | Arranque integrado en contenedores | task-03 | COMPLETA |
| 05 | [task-05](task-05/PLAN.md) | Harness de integración sin Gateway | task-04 | COMPLETA |
| 06 | [task-06](task-06/PLAN.md) | Contratos y flujos funcionales completos | task-05 | COMPLETA |
| 07 | [task-07](task-07/PLAN.md) | Recuperación, fallos y reinicios | task-06 | COMPLETA |
| 08 | [task-08](task-08/PLAN.md) | Verificación final y documentación | task-07 | COMPLETA |

## Entrega de cada tarea

Guardar evidencia en `agents/integracion/task-NN/resultado.md` y actualizar únicamente su estado en esta tabla. El resultado global `agents/integracion/resultado.md` corresponde a task-08. No marcar COMPLETA una tarea bloqueada o con comprobaciones pendientes.

Gateway e introspección de sesión en Users quedan fuera de alcance en todas las tareas. Los detalles y escenarios del plan original están distribuidos en las carpetas; CONTEXTO.md conserva las reglas comunes.

## Prompt para comenzar

> Lee `agents/integracion/CONTEXTO.md` y `agents/integracion/task-01/PLAN.md`. Ejecuta únicamente task-01, verifica sus criterios de cierre y registra evidencia en `agents/integracion/task-01/resultado.md`. Actualiza su estado en el índice. No ejecutes task-02 en este turno.

## Prompt para continuar

> Lee `agents/integracion/CONTEXTO.md`, el índice y `agents/integracion/task-NN/PLAN.md`. Sustituye NN por la tarea que te indico. Lee los resultados de las tareas anteriores y comprueba sus dependencias. Ejecuta solo esta tarea, verifica sus criterios de cierre, guarda su resultado y actualiza el índice. Detente después de entregar el resultado; no avances a la siguiente tarea.
