# Estado de users-service — Grupo 2

Rama: `feat/users-perfil-authz`. Checkpoint WIP conservado: `fb18495`.

## Verificado por el usuario, no reejecutado

- Lint y typecheck sin errores; 23 suites y 142 pruebas verdes.
- Cobertura combinada: 96,15% sentencias, 89,95% ramas, 95,23% funciones,
  98,05% líneas; umbral 70% cumplido.
- Docker multi-stage correcto, usuario `node`, healthcheck `/health/ready`;
  Compose válido y puerto 3002 no publicado.
- Existen Dockerfile, Compose, CI, validador OpenAPI y las dos migraciones.
- P2028 resuelto con `127.0.0.1`; no ajustar timeouts ni profile.repository.ts.

## Pendiente de esta continuación

- Clasificar USR-001–070 mediante existencia de rutas y evidencia citada;
  marcar solamente `tasks/tasks_userService.md`.
- Revisar mappers de errores, diferencias contractuales y etapas/umbral CI.
- Completar aportes provider/fixtures Users de USR-071–078, sin fingir G1/G3.
- Verificar arranque Compose y ejecutar la validación final única.
- Documentar resultados reales, bloqueos y dejar cambios en commits pequeños.

Los resultados comunicados no acreditan integración con G1/G3 ni CI remota.
La trazabilidad por archivo de US1/US3/US4 está en
`specs/001-fundamentos-identidad/validation-report.md`.
