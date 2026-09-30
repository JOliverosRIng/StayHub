# AUTH-084 — Resultado de ejecución

Fecha: 2026-09-29. Base revisada: commit `393a80d`, rama `Auth_Service` (trabajo sin commitear).
Estado: **PARCIAL (no se declara cierre completo)**.

Dependencias leídas: AUTH-075, AUTH-082, AUTH-083 (GREEN local) y AUTH-076–081 (BLOQUEADO EXTERNO).
Reglas aplicadas: D01, D09. Auditoría: H18 (sin Users/Gateway) y cierre del backlog.

## Objetivo

Reunir la evidencia final de Auth en `specs/001-fundamentos-identidad/validation-report.md`, actualizar las
casillas del backlog solo con evidencia y dejar visibles las dependencias externas y la revisión humana
pendientes, sin certificar un cierre ficticio.

## Cambios realizados

| Archivo | Cambio |
|---|---|
| `specs/001-fundamentos-identidad/validation-report.md` (nuevo) | Informe de validación parcial: entorno, calidad final, cobertura, matriz RQ-02/FR-001–013/FR-024/SC-002–004/SC-007, distinción stub/real y bloqueos. |
| `specs/001-fundamentos-identidad/tasks/tasks_authService.md` | `AUTH-075`, `AUTH-082` y `AUTH-083` marcadas `[X]` con evidencia local; `AUTH-076–081` y `AUTH-084` permanecen `[ ]`. |
| `apps/auth-service/README.md` | Documentada la prueba manual con Swagger (`npm run dev:swagger`). |
| `scripts/dev-auth-swagger.mjs` + `scripts/users-stub.mjs` + `infra/docker/auth/Dockerfile.users-stub` + `infra/docker/auth/compose.dev.yml` (nuevos) | Harness local de Swagger con stub de Users en dos modos: nativo (`npm run dev:swagger`) y contenedor (`npm run dev:swagger:docker`, auth/migrate/DB/Redis/Users-stub en Compose con `127.0.0.1:3001` publicado). |
| `apps/auth-service/src/interfaces/openapi/openapi.factory.ts` | En desarrollo, Swagger añade el servidor `http://127.0.0.1:<puerto>` para probar desde el navegador (el contrato de drift no cambia). |

## Calidad final de la revisión candidata

```sh
npm run prisma:generate   # OK
npm run typecheck         # OK
npm run lint              # OK
npm run build             # OK
npm run openapi:check     # 11 tests de drift
npm run test:coverage --workspace @stayhub/auth-service   # 38 suites, 439 tests, 0 fallos
npm run test:cross-service --workspace @stayhub/auth-service -- --runTestsByPath test/integration/auth-compose.spec.ts
                          # 1 suite, 7 tests (Podman)
```

Cobertura global: **stmts 88.64 / branch 73.63 / funcs 88.66 / lines 89.91** (umbral 70 superado).

## Criterios de aceptación

- [x] Cada afirmación de cumplimiento apunta a una prueba ejecutada (matriz del informe).
- [x] Cobertura ≥70%, contratos, concurrencia, migraciones, seguridad y Compose con evidencia.
- [ ] Dependencias externas (AUTH-076–081) y revisión humana: **pendientes**. Por eso AUTH-084 no se cierra.

## Bloqueos

- **G2 (users-service):** provider/contrato de registro y lookup; bloquea AUTH-076/077/079/080.
- **G1 (gateway):** expectativas y URL/puerto público; bloquea AUTH-078/081.
- **Revisión humana:** integrante distinto, exigida por la constitución; pendiente.
- **Node 20:** no se probó la versión exacta del `engines` (se usó Node 22).

## Handoff

Al recibir los contratos/proveedores de G1/G2: ejecutar AUTH-076–081, re-ejecutar el cierre y completar la
revisión humana para cerrar AUTH-084.
