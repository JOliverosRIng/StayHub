# AUTH-075 — Resultado de ejecución

Fecha: 2026-09-29. Base revisada: commit `393a80d`, rama `Auth_Service` (trabajo sin commitear).
Estado: **Implementado local (GREEN)**.

Dependencias leídas: AUTH-047 y AUTH-073 (implementadas localmente). Reglas aplicadas: D01, D02, D09, D10.
Auditoría: H12 (`check-auth-openapi-syntax.mjs` solo comprobaba versión y cuatro rutas).

## Objetivo

Convertir `openapi:check` en una verificación real de drift: generar el documento desde los controladores
productivos, compararlo por estructura con `openapi-auth-service.yaml` y fallar ante cualquier cambio
incompatible (schemas, guards, respuestas, límites, `additionalProperties`, `security`).

## Cambios realizados

| Archivo | Cambio | Motivo |
|---|---|---|
| `apps/auth-service/test/helpers/auth-openapi.ts` (nuevo) | `generateAuthOpenApiDocument()` compone los tres controladores reales con `ServiceJwtVerifier`, `CLOCK` y stubs de los cuatro casos de uso, y devuelve `createAuthOpenApi(app)`. | Generar el documento real sin DB ni proveedores. |
| `scripts/validate-auth-openapi.mjs` (nuevo) | Comparador con resolución de `$ref` locales, normalización de orden/`enum`/`required`/`parameters` y exclusión explícita de health; CLI que falla con lista de diferencias. | Detectar drift entre generado y YAML, no solo nombres ni un snapshot vacío. |
| `apps/auth-service/test/contract/openapi-drift.spec.ts` (nuevo) | Suite positiva + 8 mutaciones negativas (401 ausente, ADMIN permitido, `required` eliminado, `3600`→`1800`, `security` ausente, path extra, `Idempotency-Key` sin UUID, versión rebajada) + health excluido + salida temporal. | Verificar que un cambio incompatible falla; no muta archivos fuente. |
| `src/interfaces/openapi/openapi.factory.ts` | `setOpenAPIVersion('3.0.3')`; `SessionValidation` añadido a `CLOSED_SCHEMAS`; `normalizeEnumScalarTypes` corrige enums escalares (`integer`/`boolean`) que Nest emite como `number`. | Corregir drift real detectado por la comparación. |
| `src/interfaces/http/registration.controller.ts` | `@ApiHeader` de `Idempotency-Key` con `schema: { type: string, format: uuid }`. | El YAML declara `format: uuid`; el Swagger no lo emitía. |
| `src/interfaces/http/dto/problem.response.ts` | `status` con `type: 'integer'`. | El YAML declara `integer`; el Swagger emitía `number`. |
| `package.json` | `openapi:check` encadena `check-auth-openapi-syntax.mjs` + la suite de drift. | Integrar la comparación en CI conservando la comprobación de sintaxis. |
| `.github/workflows/ci.yml` | `scripts/**` añadido a `paths` del PR. | Ejecutar el chequeo cuando cambia el validador. |

No se modificaron `openapi-public.yaml` ni los contratos de Users/Gateway. No se versionó ningún documento
generado: la generación escribe en `os.tmpdir()` durante la prueba.

## Comportamiento verificado

- Documento generado: `openapi: 3.0.3`; cuatro rutas internas POST con `serviceAuth`; `Idempotency-Key`
  `format: uuid`; `InternalTokenPair.expiresIn` `integer` enum `[3600]`; `SessionValidation.active`
  `boolean` enum `[true]`; `Problem.status` `integer`; `SessionValidation` cerrado.
- El comparador iguala generado y YAML sin drift y rechaza las ocho mutaciones, incluida la lista de rutas
  funcionales extra. Health (`/health/live`, `/health/ready`) queda documentado solo en el YAML y se excluye
  por diseño con una prueba separada.

## Evidencia de comandos

```sh
npm run prisma:generate  # OK (sin cambios de schema)
npm run typecheck        # OK
npm run lint             # OK
npm run build            # OK
npm run openapi:check    # OK (sintaxis + 11 tests de drift)
npm run test:unit        # 17 suites, 139 tests, 0 fallos
npm run test:contract    # 7 suites, 142 tests, 0 fallos
```

## Criterios de aceptación

- [x] Un cambio incompatible de Swagger o YAML falla el comando CI (`openapi:check` ejecuta la suite de drift).
- [x] La comparación no se limita a nombres ni a un snapshot vacío: cubre `required`/`enum`/límites/types/
      `additionalProperties`/`security`/respuestas/`Retry-After`.
- [x] Los documentos generados de prueba no quedan versionados como fuente de verdad (viven en `os.tmpdir()`).

## Pendiente / handoff

- **AUTH-083** (siguiente local): auditoría de secretos y spans/traceId.
- **AUTH-082**: imagen/Compose con Podman (no hay Docker).
- **AUTH-076–081:** preparar suites cross-service y registrar BLOQUEADO EXTERNO (G1/G2).
- **AUTH-084:** informe de cierre parcial.
- Sin bloqueos de infraestructura para esta tarea.
