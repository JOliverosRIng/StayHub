# AUTH-033 — Resultado de ejecución

Fecha: 2026-09-28. Base revisada: commit `393a80d`, rama `Auth_Service`. Estado: **Implementado local (GREEN)**.

Dependencias: PRE-001 y PRE-004 (verificadas). Reglas aplicadas: D01–D03, D07–D10.

## Objetivo

Impedir fugas de secretos/PII en logs y respuestas de error del registro, y preparar pruebas de seguridad
con marcadores sintéticos en stdout, stderr y telemetría.

## Cambios realizados

| Archivo | Cambio | Motivo |
|---|---|---|
| `apps/auth-service/src/infrastructure/observability/auth-logger.ts` | Política de logging por **claves permitidas** (`code/status/traceId/dependency/...`); `Error` se reduce a `{name,kind}` (nunca `message`/`stack`); arrays → `{count}`; objetos anidados filtrados; correos en strings directos → `[REDACTED]`. | `sanitize` anterior devolvía `Error.message` y recursaba objetos/arrays sin filtro, filtrando contraseñas/hashes/JWT. |
| `apps/auth-service/src/interfaces/http/problem.filter.ts` | Ya no envía la excepción cruda al logger; registra `code/status/traceId`. | Evitar que el texto de un error (incluido el de Users) llegue a logs. |
| `apps/auth-service/test/security/registration-secrets.spec.ts` | **Nuevo.** 5 pruebas con marcadores sintéticos para password, hash, service JWT y email, capturando `stdout`, `stderr` y `emitTelemetryLog` (módulo OTel mockeado). | No existía suite de secretos. |

`trace.interceptor.ts` no requirió cambios: la conservación de `traceId` previa a los guards (PRE-001) se
verificó con un test. La propagación de span/contexto es alcance de AUTH-083.

## Cobertura (5/5 GREEN)

1. Objetos anidados, arrays y `Error` con secretos en `message` no aparecen en stdout, stderr ni telemetría.
2. Se conservan `code/status/traceId`; de un `Error` solo sale `{name,kind}`.
3. Un 500 por error desconocido no reenvía el `message` (respuesta `INTERNAL_ERROR`) y el `traceId` se
   mantiene en cuerpo, header y logs.
4. `503 DEPENDENCY_UNAVAILABLE` y `409 REGISTRATION_CONFLICT` devuelven `application/problem+json` sin PII.
5. Un 401 de guard conserva el mismo `traceId` en header y cuerpo, sin secretos en logs.

## Evidencia de comandos

```sh
npm run typecheck --workspace @stayhub/auth-service   # OK
npm run lint --workspace @stayhub/auth-service        # OK
npm run build --workspace @stayhub/auth-service       # OK
npm run test --workspace @stayhub/auth-service -- --selectProjects security \
  --runTestsByPath test/security/registration-secrets.spec.ts
# PASS — 5/5

# unit + security + integration (con PostgreSQL/Redis de compose.test.yml)
# PASS — 12 suites, 74 tests
```

## Criterios de aceptación

- [x] Los marcadores sintéticos no aparecen en ningún destino de logs.
- [x] Los errores 409/503 no exponen payload/PII; 400 los cubre AUTH-026 (mensajes de validación sin valores).
- [x] La salida 201 respeta la excepción contractual (AUTH-026 verifica solo `id/name/email/role`; se
  re-confirmará con el controlador real en AUTH-045).

## Pendiente / handoff

- **AUTH-042/AUTH-045:** completar recorridos de saga reales y re-ejecutar esta suite contra el controlador y
  el caso de uso productivos (paso 5 del plan).
- **AUTH-083:** correlación/telemetría (span HTTP y traceId en contexto de log/OTLP) sobre esta base.
- Sin bloqueos de infraestructura.
