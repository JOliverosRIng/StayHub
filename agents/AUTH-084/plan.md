# AUTH-084 — Cerrar evidencia, trazabilidad y tareas de Auth

Estado inicial: pendiente. Tipo: Cierre; exige evidencia local y externa.

## Resultado esperado y evidencia

No existe validation-report.md que certifique el incremento. Las casillas iniciales no prueban la ejecución de las suites.

## Preparación

Leer [reglas compartidas](../decisiones.md): D01, D09, y [auditoría](../auditoria.md). Ejecutar desde la raíz del repositorio.

Dependencias: [AUTH-075](../AUTH-075/plan.md), [AUTH-076](../AUTH-076/plan.md), [AUTH-077](../AUTH-077/plan.md), [AUTH-078](../AUTH-078/plan.md), [AUTH-079](../AUTH-079/plan.md), [AUTH-080](../AUTH-080/plan.md), [AUTH-081](../AUTH-081/plan.md), [AUTH-082](../AUTH-082/plan.md), [AUTH-083](../AUTH-083/plan.md).

## Archivos concretos

- `specs/001-fundamentos-identidad/validation-report.md`
- `specs/001-fundamentos-identidad/tasks/tasks_authService.md`
- `agents/README.md`
- `apps/auth-service/README.md`
- `.github/workflows/ci.yml`

## Pasos de ejecución

1. Reunir resultados de cada plan, commits, versiones Node/PostgreSQL/Redis, comandos, código de salida, conteo de suites/casos y artefactos de cobertura; nunca copiar credenciales/tokens/PII.
2. Crear matriz RQ02/FR001–013/FR024/SC002–004 aplicables→contrato→prueba concreta→resultado. No declarar pruebas de usabilidad SC001/005/006 ejecutadas por backend.
3. Ejecutar calidad final una vez sobre revisión candidata: lint/typecheck/build/tests/coverage/OpenAPI e imagen. Repetir solo si se corrige código después.
4. Distinguir local con stub y real entre servicios. AUTH076–081 bloqueadas permanecen sin marcar y el entregable no se declara terminado completo; registrar owner y condición para reanudar.
5. Actualizar casillas únicamente con evidencia, incluyendo correcciones de bases antes marcadas. Si falta RED histórico declararlo; no fabricarlo retrospectivamente.
6. Registrar revisión de un integrante distinto como pendiente hasta evidencia real, según constitución. Sin aprobación externa aún puede entregarse un informe parcial preciso, no un cierre ficticio.

## Criterios de aceptación

- [ ] Cada afirmación de cumplimiento apunta a una prueba ejecutada.
- [ ] Cobertura>=70%, contratos, concurrencia, migraciones, seguridad y Compose tienen evidencia.
- [ ] Dependencias externas y revisión humana completadas o claramente pendientes; solo en primer caso se cierra AUTH084.

## Comprobación

```sh
npm run lint
npm run typecheck
npm run build
npm run test:coverage --workspace @stayhub/auth-service
npm run openapi:check
```

No marcar tareas ni revisión humana automáticamente por existir archivos de pruebas.

Al terminar, crear `agents/AUTH-084/resultado.md` con cambios, pruebas y bloqueos. No declarar como ejecutada una prueba pendiente de infraestructura. El estado del plan solo cambia cuando sus criterios se verifican.

