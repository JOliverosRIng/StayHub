# Task 04 — Arranque integrado en contenedores

Estado inicial: PENDIENTE.
Origen: Fase C4 y cierre C1 del plan de integración.
Dependencia: task-03 completa; leer también los resultados anteriores acumulados.
Resultado: `agents/integracion/task-04/resultado.md`.

## Antes de ejecutar

Leer [reglas comunes](../CONTEXTO.md) y el [índice](../PLAN.md).
Comprobar el estado real del código y preservar cambios existentes. Ejecutar solo esta tarea.

## Alcance específico y secuencia

Actualizar `infra/docker/auth/compose.dev.yml`, la sección de contenedores de `scripts/dev-auth-swagger.mjs` y las dependencias necesarias de `docker-compose.yml`. Reutilizar la configuración persistente de task-02. Revisar Dockerfiles solo ante fallo demostrado de build. El comando `npm run dev:swagger:docker` debe usar Users real; eliminar users-stub del Compose de desarrollo. Conservar los stubs de tests aislados. No usar `down -v` al detener desarrollo. Aplicar también al modo contenedor la ayuda de Swagger documentada en task-03.

### C4. Modo contenedor

- Eliminar `users-stub` y su dependencia del Compose de desarrollo.
- Arrancar Users y Auth reales con migraciones previas y redes de servicios compartidas.
- Incorporar `users-service: service_healthy` como dependencia de Auth donde corresponda.
  Users ya tiene HEALTHCHECK en su Dockerfile; confirmar que Compose lo reconoce.
- El entorno de desarrollo puede publicar Auth 3001 y Users 3002 exclusivamente en
  `127.0.0.1` para Swagger y pruebas directas. El Compose base mantiene puertos privados.
- Pasar a la interpolación de Compose todas las variables requeridas de Users;
  `env_file` de Auth por sí solo no resuelve `${USERS_...:?required}` del YAML.
- Verificar ambos builds con el lockfile y workspaces actuales. No asumir que las
  imágenes antiguas funcionan después de haber unido los workspaces.
- No cambiar el engine instalado: usar Docker o Podman compatible y registrar cuál.

## Criterio de cierre de esta tarea

Ambas imágenes construidas, migraciones y healthchecks correctos; registro→login→perfil en contenedores; loopback solo en override de desarrollo; parada/reinicio conserva datos y secretos. Ninguno de los dos comandos habituales arranca el stub.

Guardar el resultado usando el formato de CONTEXTO.md y actualizar la fila task-04 del índice. Dejar el contexto necesario para task-05, sin ejecutarla.
