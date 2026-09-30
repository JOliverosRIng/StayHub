# Bloque 4 — Contratos, integración y cierre (resultados consolidados)

Fecha: 2026-09-29. Base: commit `393a80d` (rama `Auth_Service`), trabajo sin commitear.
Fuente de detalle: `agents/<ID>/resultado.md`. Memoria general: [`README.md`](README.md).

Estado del bloque: **EN CURSO**. Al ejecutar, seis de los diez planes (AUTH-076–081) dependen de proveedores
externos G1/G2 que no existen en este repositorio: se preparan sus suites y quedan **BLOQUEADO EXTERNO**, no
se marcan como verificados.

## Planes

| Orden | ID | Tipo | Estado | Resultado |
|---|---|---|---|---|
| 38 | AUTH-075 | Swagger generado vs contrato Auth | Implementado local (GREEN) | [resultado](../AUTH-075/resultado.md) |
| 39 | AUTH-076 | Consumer G2 (registro) | Pendiente — BLOQUEADO EXTERNO | — |
| 40 | AUTH-077 | Consumer G2 (lookup) | Pendiente — BLOQUEADO EXTERNO | — |
| 41 | AUTH-078 | Provider G1 | Pendiente — BLOQUEADO EXTERNO | — |
| 42 | AUTH-079 | Integración Auth↔Users registro | Pendiente — BLOQUEADO EXTERNO | — |
| 43 | AUTH-080 | Integración Auth↔Users login | Pendiente — BLOQUEADO EXTERNO | — |
| 44 | AUTH-081 | Integración HTTPS Gateway↔Auth | Pendiente — BLOQUEADO EXTERNO | — |
| 45 | AUTH-082 | Imagen/migraciones/Compose | Implementado local (GREEN, Podman) | [resultado](../AUTH-082/resultado.md) |
| 46 | AUTH-083 | Auditoría de secretos y telemetría | Implementado local (GREEN) | [resultado](../AUTH-083/resultado.md) |
| 47 | AUTH-084 | Cierre de evidencia y trazabilidad | Informe parcial (bloqueado por 076–081 + revisión humana) | [resultado](../AUTH-084/resultado.md) · [informe](../../specs/001-fundamentos-identidad/validation-report.md) |

## Resumen por plan

- **AUTH-075** — `openapi:check` pasa de validar sintaxis a comparar por estructura el Swagger generado con
  `openapi-auth-service.yaml`: resolución de `$ref`, `required`/`enum`/límites/`additionalProperties`/
  `security`/respuestas/`Retry-After` y bloqueo de rutas funcionales extra. Corrige el drift real del
  generador (versión 3.0.3, `Idempotency-Key` UUID, `Problem.status` integer, enums escalares de
  `expiresIn`/`active`, `SessionValidation` cerrado). 8 mutaciones negativas garantizan que el CI falle.
- **AUTH-083** — Secretos y telemetría: spans HTTP explícitos con atributos allowlist y `trace.id`
  correlacionado con cabecera/Problem/log; `instance` sin query; errores de validación sin nombres de campo
  arbitrarios; `auth-logger` redacta JWT además de correos; cierre de telemetría en `SIGTERM`/`SIGINT` y
  arranque con código seguro; `AUTH_ARGON2_TIME_COST` mínimo 2. Suite `no-secret-leakage` con 13 tests y
  exporters OTel in-memory.
- **AUTH-082** — Verificación real en contenedor con Podman (Docker ausente): imagen runtime no root,
  `argon2`/Prisma con OpenSSL, migraciones antes del tráfico, detección de esquema incompleto (`ready` 503
  con `live` 200), caída de Redis, reinicio sin pérdida de datos y OTLP ausente sin bloquear `ready`.
  Harness `compose-harness` + `auth-compose.spec.ts` (7 tests) con limpieza total verificada.
- **AUTH-084** — Informe de validación **parcial** en `specs/001-fundamentos-identidad/validation-report.md`:
  matriz RQ-02/FR-001–013/FR-024/SC-002–004/SC-007, calidad final (38 suites, 439 tests, cobertura global
  88.64/73.63/88.66/89.91), distinción stub/real y bloqueos. Casillas `AUTH-075/082/083` marcadas `[X]`;
  `AUTH-076–081` y `AUTH-084` quedan abiertas. Incluye `npm run dev:swagger` (modo nativo) y
  `npm run dev:swagger:docker` (auth-service, migraciones, DB/Redis y stub de Users en contenedores con
  Swagger publicado) para probar la API desde Swagger UI.

## Evidencia agregada (AUTH-075, AUTH-082, AUTH-083)

```sh
npm run typecheck        # OK
npm run lint             # OK
npm run build            # OK
npm run openapi:check    # OK (sintaxis + 11 tests de drift)
npm run test:unit        # 17 suites, 140 tests
npm run test:contract    # 7 suites, 142 tests
npm run test:security    # 3 suites, 59 tests
npm run test:cross-service --workspace @stayhub/auth-service -- --runTestsByPath test/integration/auth-compose.spec.ts
                         # 1 suite, 7 tests (Podman 5.8.7 + podman-compose 1.6.0)
```

## Bloqueos externos declarados

- **G2 (users-service):** contrato `GET /internal/v1/registrations/{id}` y `UserSummary`; bloquea AUTH-076/079.
- **G2 (users-service):** endpoint real de lookup; bloquea AUTH-077/080.
- **G1 (gateway):** expectativas de los cuatro handlers y URL/puerto acordado; bloquea AUTH-078/081.
- **Docker:** no instalado; AUTH-082 verificado con Podman (CI lo ejecutará con Docker).

## Siguiente

Bloque 4 con lo propio de Auth cerrado. Para completar **AUTH-076–081**: recibir los contratos/proveedores
de G1/G2, ejecutar las suites cross-service (usan `requireCrossServiceProviders()`) y re-ejecutar el cierre.
**AUTH-084** se cierra solo cuando exista toda la evidencia externa y la revisión humana.
