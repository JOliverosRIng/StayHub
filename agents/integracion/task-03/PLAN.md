# Task 03 — Arranque nativo con Users real

Estado inicial: PENDIENTE.
Origen: Fase C1, C3 y C5 del plan de integración.
Dependencia: task-02 completa; leer también los resultados anteriores acumulados.
Resultado: `agents/integracion/task-03/resultado.md`.

## Antes de ejecutar

Leer [reglas comunes](../CONTEXTO.md) y el [índice](../PLAN.md).
Comprobar el estado real del código y preservar cambios existentes. Ejecutar solo esta tarea.

## Alcance específico y secuencia

Actualizar `scripts/dev-auth-swagger.mjs` y scripts auxiliares necesarios para `npm run dev:swagger`, reutilizando la configuración de task-02. Puede añadirse infraestructura de desarrollo para dos PostgreSQL y Redis, pero no modificar aún el modo `--service-container`, reservado a task-04. Conservar su funcionamiento previo mientras se prepara esa tarea. No arrancar `scripts/users-stub.mjs` en modo nativo. Actualizar ayuda y documentación del modo nativo.

### C3. Modo nativo

- Levantar PostgreSQL para cada servicio y Redis para Auth; arrancar ambos procesos Node.
- Ejecutar los scripts raíz existentes `prisma:auth:generate`, `prisma:users:generate`,
  `build:auth` y `build:users`; aplicar las migraciones propias de cada servicio.
- Auth escucha por defecto en 3001; Users en 3002, que su configuración exige.
- El antiguo `--users-port` del stub debe retirarse con error explicativo si se usa,
  o aceptar únicamente 3002. Documentar la conducta elegida; no ignorarlo silenciosamente.
- `--port` debe configurar el puerto real de Auth y su espera de readiness.
- Mantener `--skip-deps` y `--build` con significado documentado para ambos servicios.
- No interpretar que un puerto abierto significa que la base/usuario/esquema son correctos.
  Comprobar conexión y migraciones con las URLs configuradas.
- La revalidación histórica menciona Users de pruebas en 55432, el mismo puerto que
  usa por defecto el Compose antiguo de Auth. No detenerlo ni asumir que es Auth.
  Usar puertos configurables y libres para el entorno nuevo.
- Esperar readiness de ambos servicios antes de anunciar que Swagger está listo.
- Al salir, detener los procesos iniciados por el script y conservar datos de desarrollo.

### C5. Ayuda de Swagger

Documentar dos tokens diferentes:

1. JWT de servicio de desarrollo para invocar Auth en Swagger, representando al Gateway.
2. `accessToken` obtenido del login de Auth para consultar/editar perfil en Users.

No usar un token firmado a mano como evidencia del recorrido login→perfil.
La herramienta local puede entregar el token de desarrollo al usuario, pero no
guardarlo en logs de pruebas, commits ni informes. Documentar Swagger de cada servicio
según sus rutas reales y comprobar que `Try it out` apunta al origen correcto.

## Criterio de cierre de esta tarea

Arranque nativo real, migraciones y readiness de ambos; registro→login→perfil observado, flags verificados y parada limpia conservando datos/secretos. Registrar qué dependencias crea y cómo se reinician.

Guardar el resultado usando el formato de CONTEXTO.md y actualizar la fila task-03 del índice. Dejar el contexto necesario para task-04, sin ejecutarla.
