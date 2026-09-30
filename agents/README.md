# Planes ejecutables de auth-service

Hay **47 planes**: uno por cada una de las **43 tareas pendientes originales** y **4 preparaciones** necesarias por hallazgos del código. La revisión base es del commit `393a80d` (2026-09-28).

Durante la validación final aparecieron cambios concurrentes en bootstrap, módulos base, configuración HTTP y helpers de pruebas. No forman parte de esta planificación. Antes de ejecutar un plan, revisar el diff actual y su eventual `resultado.md`: algunos pasos de PRE-001 podrían estar ya implementados. Conservar esos cambios y verificar su resultado antes de repetir trabajo.

Empieza por [la auditoría](auditoria.md) para saber qué existe y qué no está demostrado. Las decisiones de implementación comunes están en [decisiones.md](decisiones.md). Esta carpeta es `agents/`; no modifica ni reemplaza `.agents/`. El avance y la memoria de ejecución están en [result/README.md](result/README.md): léelo primero en cada sesión nueva.

## Cómo usar con un modelo de menor costo

Entrega **un plan por conversación** y continúa en este mismo repositorio. El plan enumera archivos, comportamiento, casos límite, comandos y condición de terminado. Las dependencias deben estar ejecutadas antes, salvo tareas de pruebas que se preparan en RED y se vuelven a ejecutar al conectar su implementación.

Prompt sugerido (cambiar PRE-001 por el ID elegido):

> Ejecuta agents/PRE-001/plan.md. Lee los apartados de agents/decisiones.md que indica y el resultado de sus dependencias, si existen. Reutiliza el código existente. Limita cambios a su alcance. Ejecuta las comprobaciones indicadas y registra evidencia en agents/PRE-001/resultado.md. Si falta infraestructura o un proveedor externo, deja el trabajo independiente listo y describe el bloqueo concreto. No marques comportamiento como completo por existir un archivo. No implementes otros planes automáticamente.

No enviar todos los planes al mismo modelo de una vez. El orden de abajo es secuencial, validado contra las dependencias documentadas; no requiere trabajo paralelo.

## Cómo interpretar el estado

- **Planificación**: todos los planes se entregan pendientes; no se implementó código en esta tarea.
- **Prueba preparada (RED)**: debe fallar por conducta ausente, no importación/entorno. Habilita comenzar la implementación que depende de esa prueba. Su casilla original no se cierra como verificación completa hasta GREEN.
- **Implementado localmente (GREEN)**: pasó con dependencias reales de Auth y, cuando corresponda, stub Users declarado.
- **Bloqueado externo**: se preparó la suite, pero falta proveedor/contrato G1/G2. No sustituir ese estado por un test omitido exitoso.
- **Verificado**: criterios y evidencia del plan completos. Actualizar tareas originales únicamente entonces.

El build, Jest y Docker no se ejecutaron en la revisión inicial: no había node_modules ni Docker y Node era 22 frente al requisito 20. PRE-001 prepara esa base; [auditoria.md](auditoria.md) distingue problemas confirmados por lectura de riesgos por verificar.

## 1. Preparación

| Orden | Plan | Dependencias de estos planes |
|---|---|---|
| 1 | [PRE-001 — Preparar ejecución, composición y harness reutilizable](PRE-001/plan.md) | — |
| 2 | [PRE-004 — Fijar contratos entre Auth, Users y Gateway](PRE-004/plan.md) | — |
| 3 | [PRE-002 — Completar persistencia y exclusión de la saga de registro](PRE-002/plan.md) | PRE-001, PRE-004 |
| 4 | [PRE-003 — Crear unidad transaccional de sesiones y revocación](PRE-003/plan.md) | PRE-001, PRE-002 |

PRE-004 puede preparar el contrato candidato de Users sin esperar su aceptación. La aceptación real bloquea AUTH-076/079, no el desarrollo local contra stub.

## 2. Registro — 13 pendientes originales

| Orden | Plan | Dependencias de estos planes |
|---|---|---|
| 5 | [AUTH-026 — Pruebas HTTP del registro](AUTH-026/plan.md) | PRE-001, PRE-004 |
| 6 | [AUTH-030 — Pruebas de concurrencia del registro](AUTH-030/plan.md) | PRE-002 |
| 7 | [AUTH-031 — Pruebas de recuperación de la saga](AUTH-031/plan.md) | PRE-002, PRE-004 |
| 8 | [AUTH-032 — Pruebas del reconciliador](AUTH-032/plan.md) | PRE-002, PRE-004 |
| 9 | [AUTH-033 — Pruebas y corrección de secretos en registro](AUTH-033/plan.md) | PRE-001, PRE-004 |
| 10 | [AUTH-041 — Implementar adapter Users para registro](AUTH-041/plan.md) | PRE-001, PRE-004 |
| 11 | [AUTH-040 — Implementar RegisterAccountUseCase](AUTH-040/plan.md) | PRE-002, PRE-004, AUTH-026, AUTH-030, AUTH-031 |
| 12 | [AUTH-042 — Conectar saga con Users y errores recuperables](AUTH-042/plan.md) | AUTH-040, AUTH-041 |
| 13 | [AUTH-043 — Implementar reconciliación programada](AUTH-043/plan.md) | AUTH-032, AUTH-042 |
| 14 | [AUTH-045 — Exponer controlador interno de registro](AUTH-045/plan.md) | AUTH-026, AUTH-042, AUTH-043 |
| 15 | [AUTH-046 — Componer módulos de registro y credenciales](AUTH-046/plan.md) | AUTH-045 |
| 16 | [AUTH-047 — Sincronizar OpenAPI de registro](AUTH-047/plan.md) | AUTH-046 |
| 17 | [AUTH-048 — Cerrar verificación de registro US1](AUTH-048/plan.md) | AUTH-026, AUTH-030, AUTH-031, AUTH-032, AUTH-033, AUTH-040, AUTH-041, AUTH-042, AUTH-043, AUTH-045, AUTH-046, AUTH-047 |

AUTH-048 verifica la historia de registro completa. Para las suites preparadas en RED, ejecutar de nuevo después de AUTH-045/046.

## 3. Login, tokens y sesiones — 20 pendientes originales

| Orden | Plan | Dependencias de estos planes |
|---|---|---|
| 18 | [AUTH-049 — Pruebas HTTP de login](AUTH-049/plan.md) | PRE-001, PRE-004 |
| 19 | [AUTH-050 — Pruebas HTTP de refresh](AUTH-050/plan.md) | PRE-001, PRE-004 |
| 20 | [AUTH-051 — Pruebas HTTP de introspección](AUTH-051/plan.md) | PRE-001, PRE-004 |
| 21 | [AUTH-052 — Pruebas unitarias de LoginUseCase](AUTH-052/plan.md) | PRE-001, PRE-004 |
| 22 | [AUTH-053 — Probar y completar verificación de access JWT](AUTH-053/plan.md) | PRE-001 |
| 23 | [AUTH-055 — Pruebas SQL de rotación, replay y concurrencia](AUTH-055/plan.md) | PRE-003 |
| 24 | [AUTH-056 — Pruebas reales de rate limit Redis](AUTH-056/plan.md) | PRE-001 |
| 25 | [AUTH-057 — Pruebas de validación y caché de sesión](AUTH-057/plan.md) | PRE-003, PRE-004 |
| 26 | [AUTH-058 — Pruebas de guards, roles y service JWT](AUTH-058/plan.md) | PRE-001, AUTH-053 |
| 27 | [AUTH-063 — Implementar lookup de identidad para login](AUTH-063/plan.md) | PRE-001, PRE-004 |
| 28 | [AUTH-064 — Implementar rate limiter y Retry-After](AUTH-064/plan.md) | AUTH-056, PRE-004 |
| 29 | [AUTH-066 — Preparar y firmar pares de tokens](AUTH-066/plan.md) | PRE-003, AUTH-053 |
| 30 | [AUTH-065 — Implementar login y creación atómica de sesión](AUTH-065/plan.md) | AUTH-052, AUTH-063, AUTH-064, AUTH-066 |
| 31 | [AUTH-067 — Implementar rotación y revocación por replay](AUTH-067/plan.md) | AUTH-055, AUTH-066 |
| 32 | [AUTH-068 — Implementar introspección autoritativa](AUTH-068/plan.md) | AUTH-057 |
| 33 | [AUTH-069 — Implementar Passport y guards de usuario](AUTH-069/plan.md) | AUTH-058, AUTH-068 |
| 34 | [AUTH-071 — Exponer controladores de login, refresh e introspección](AUTH-071/plan.md) | AUTH-049, AUTH-050, AUTH-051, AUTH-065, AUTH-067, AUTH-068, AUTH-069 |
| 35 | [AUTH-072 — Componer Login, Sessions, Tokens y adapters](AUTH-072/plan.md) | AUTH-046, AUTH-071 |
| 36 | [AUTH-073 — Sincronizar contratos de sesión](AUTH-073/plan.md) | AUTH-072, AUTH-047 |
| 37 | [AUTH-074 — Cerrar verificación de autenticación US2](AUTH-074/plan.md) | AUTH-049, AUTH-050, AUTH-051, AUTH-052, AUTH-053, AUTH-055, AUTH-056, AUTH-057, AUTH-058, AUTH-063, AUTH-064, AUTH-065, AUTH-066, AUTH-067, AUTH-068, AUTH-069, AUTH-071, AUTH-072, AUTH-073 |

Se corrige una dependencia que faltaba en el backlog: AUTH-065 consume el emisor AUTH-066. AUTH-074 verifica el conjunto local; las integraciones con proveedores reales se evalúan después.

## 4. Contratos, integración y cierre — 10 pendientes originales

| Orden | Plan | Dependencias de estos planes |
|---|---|---|
| 38 | [AUTH-075 — Comparar Swagger generado con contrato Auth](AUTH-075/plan.md) | AUTH-047, AUTH-073 |
| 39 | [AUTH-076 — Verificar contrato de registro del proveedor Users](AUTH-076/plan.md) | AUTH-048, PRE-004 |
| 40 | [AUTH-077 — Verificar contrato real de lookup Users](AUTH-077/plan.md) | AUTH-074 |
| 41 | [AUTH-078 — Verificar expectativas del Gateway sobre Auth](AUTH-078/plan.md) | AUTH-075 |
| 42 | [AUTH-079 — Integración real de registro Auth↔Users](AUTH-079/plan.md) | AUTH-076 |
| 43 | [AUTH-080 — Integración real de login Auth↔Users](AUTH-080/plan.md) | AUTH-077 |
| 44 | [AUTH-081 — Integración HTTPS Gateway↔Auth](AUTH-081/plan.md) | AUTH-078, AUTH-079, AUTH-080 |
| 45 | [AUTH-082 — Verificar imagen, migraciones y Compose de Auth](AUTH-082/plan.md) | AUTH-074 |
| 46 | [AUTH-083 — Auditar secretos y completar correlación/telemetría](AUTH-083/plan.md) | AUTH-048, AUTH-074 |
| 47 | [AUTH-084 — Cerrar evidencia, trazabilidad y tareas de Auth](AUTH-084/plan.md) | AUTH-075, AUTH-076, AUTH-077, AUTH-078, AUTH-079, AUTH-080, AUTH-081, AUTH-082, AUTH-083 |

AUTH-076–081 necesitan contratos/entornos externos; AUTH-082 necesita Docker. Si uno está bloqueado, continuar con otros planes cuyas dependencias sí estén listas, por ejemplo AUTH-082/083. AUTH-084 solo certifica cierre completo cuando existe toda la evidencia.

## Reglas de coordinación

- Los cuatro PRE son reparaciones/preparación de requisitos existentes, no alcance nuevo.
- No rehacer las 41 tareas marcadas. Reutilizar su código; corregir los puntos identificados en los planes.
- No tocar las aplicaciones o bases de G1/G2 desde Auth.
- Los nombres de archivos marcados como nuevos describen entregables futuros; no se afirma que ya existan.
- Las migraciones 003/004 se crean por PRE-002/PRE-003. Ningún otro plan edita migraciones 001/002.
- El plan global todavía describe un repositorio greenfield; esta auditoría refleja el código presente.
- La especificación y la constitución siguen siendo referencias normativas. Cambios del contrato público o de Users requieren coordinación con sus dueños; el candidato local queda rotulado como tal.
