# AUTH-083 — Resultado de ejecución

Fecha: 2026-09-29. Base revisada: commit `393a80d`, rama `Auth_Service` (trabajo sin commitear).
Estado: **Implementado local (GREEN)**.

Dependencias leídas: AUTH-048 y AUTH-074 (verificadas localmente). Reglas aplicadas: D01, D02, D08–D10.
Auditoría: H11 (logger sin sanitizar y `traceId` tras guards) y H13 (sin span HTTP ni propagación al log).

## Objetivo

Auditar y corregir los sumideros de observabilidad: cero marcadores sensibles (password, hash, tokens,
service JWT, correo) en stdout/stderr/OTLP/errores, spans HTTP reales y correlacionados por `traceId`,
`instance` sin query, errores de validación sin nombres de campo arbitrarios, arranque seguro y cierre de
telemetría ante señales.

## Cambios realizados

| Archivo | Cambio | Motivo |
|---|---|---|
| `src/interfaces/http/trace.interceptor.ts` | Span HTTP explícito (`POST /ruta`) con atributos allowlist `http.method`/`http.route`/`http.status_code`/`trace.id`; evento `dependency_unavailable` en fallos de dependencia. | H13: trazas reales y correlacionadas sin body/headers sensibles. |
| `src/interfaces/http/problem.filter.ts` | `instance` se calcula sin query string (`originalUrl` cortado en `?`). | Evitar secretos por query en Problem Details. |
| `src/interfaces/http/validation.pipe.ts` | Los errores `whitelistValidation` se mensajean como `body: unknown property is not allowed`. | No reimprimir nombres de campo arbitrarios del body remoto. |
| `src/infrastructure/observability/auth-logger.ts` | Redacción de valores JWT (`a.b.c`) además de correos en strings y contextos. | H11: defensa adicional sin depender solo de la clave. |
| `src/infrastructure/observability/shutdown.ts` (nuevo) | `registerShutdownHooks(app, stopTelemetry, source)` idempotente para `SIGTERM`/`SIGINT`. | Cerrar la app y la telemetría en señal normal, no solo en `bootstrap.catch`. |
| `src/infrastructure/observability/startup.ts` (nuevo) | `startupFailureRecord(error)` con `code: STARTUP_FAILED` y `kind`, sin mensaje. | Error de arranque seguro, sin `error.message` crudo. |
| `src/main.ts` | Usa `registerShutdownHooks` y `startupFailureRecord`. | Aplicar ambos cambios en el punto de entrada. |
| `src/infrastructure/config/auth-config.ts` | `AUTH_ARGON2_TIME_COST` mínimo `2` (antes `1`). | Hallazgo: argon2 rechaza `timeCost=1` y rompía el arranque. |
| `test/security/no-secret-leakage.spec.ts` (nuevo, 13 tests) | Exporters OTel in-memory (spans + logs), marcadores sintéticos y recorridos de registro, login éxito/401/429/503, replay, query, validación, body malformado, guard, startup y shutdown. | Evidencia de los criterios con regresión. |
| `test/unit/auth-config.spec.ts` | Test que rechaza `AUTH_ARGON2_TIME_COST=1`. | Regresión del hallazgo. |
| `apps/auth-service/package.json` | devDependency exacta `@opentelemetry/sdk-trace-base@1.30.1`. | Exporters in-memory usados por la suite. |

`otel.ts` no requirió cambios: `emitTelemetryLog` recibe el registro ya sanitizado y los exporters OTLP son
asíncronos, por lo que un colector ausente no bloquea el tráfico. La suite lo comprueba registrando un
`LoggerProvider` in-memory y verificando que el cuerpo emitido no contiene marcadores.

## Comportamiento verificado

- Marcadores ausentes en stdout, stderr, registros OTLP y atributos/eventos de span, incluidos `Error.message`,
  objetos anidados, arrays, `instance` con query, names de validación desconocidos y body JSON malformado.
- Excepciones contractuales intactas: resumen de registro (`name`/`email`) y par de tokens en login exitoso.
- Span `POST /internal/v1/login` con exactamente `http.method`, `http.route`, `http.status_code` y `trace.id`;
  `trace.id` coincide con la cabecera `x-trace-id`, el `Problem.traceId` y el log de error. En 503 se añade el
  evento `dependency_unavailable`. En rechazo de guard no hay span, pero se conserva el `traceId`.
- `startupFailureRecord` no contiene el mensaje del error; `registerShutdownHooks` cierra y detiene telemetría
  una sola vez aunque lleguen `SIGTERM` y `SIGINT`.

## Evidencia de comandos

```sh
npm run typecheck     # OK
npm run lint          # OK
npm run build         # OK
npm run openapi:check # OK (11 tests de drift, sin regresión)
npm run test:unit     # 17 suites, 140 tests
npm run test:contract # 7 suites, 142 tests
npm run test:security # 3 suites, 59 tests
```

Integración con PostgreSQL/Redis reales no se ejecutó en esta tarea (no es requisito del plan); el interceptor
añadido no altera el contrato HTTP.

## Criterios de aceptación

- [x] Cero marcadores sensibles en sumideros de observabilidad/errores.
- [x] Trazas realmente generadas y correlacionadas; no solo SDK configurado.
- [x] Las respuestas contractuales legítimas (resumen de registro y par de tokens) permanecen intactas.

## Pendiente / handoff

- **AUTH-082**: imagen/migraciones/Compose con Podman (sin Docker).
- **AUTH-076–081:** preparar suites cross-service y registrar BLOQUEADO EXTERNO (G1/G2).
- **AUTH-084:** informe de cierre parcial.
- Sin bloqueos de infraestructura para esta tarea.
