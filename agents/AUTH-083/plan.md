# AUTH-083 — Auditar secretos y completar correlación/telemetría

Estado inicial: pendiente. Tipo: Verificación de seguridad con correcciones.

## Resultado esperado y evidencia

Logger/trace requieren correcciones AUTH-033/PRE-001. OTEL SDK/exporters existen, pero no se crean spans HTTP explícitos ni contexto traceId de error.

## Preparación

Leer [reglas compartidas](../decisiones.md): D01, D02, D08–D10, y [auditoría](../auditoria.md). Ejecutar desde la raíz del repositorio.

Dependencias: [AUTH-048](../AUTH-048/plan.md), [AUTH-074](../AUTH-074/plan.md).

## Archivos concretos

- `apps/auth-service/test/security/no-secret-leakage.spec.ts`
- `apps/auth-service/src/infrastructure/observability/auth-logger.ts`
- `apps/auth-service/src/infrastructure/observability/otel.ts`
- `apps/auth-service/src/interfaces/http/trace.interceptor.ts`
- `apps/auth-service/src/interfaces/http/problem.filter.ts`
- `apps/auth-service/src/main.ts`

## Pasos de ejecución

1. Capturar stdout/stderr/OTLP con colector de test o exporter in-memory. Ejecutar registro, idempotencia, login fallido/éxito,429, refresh, replay,503 y reconciliación.
2. Usar marcadores únicos de password/hash/access/refresh/serviceJWT/email; no deben estar en logs/trazas/errores. Excepciones contractuales solo token pair exitoso y resumen name/email de registro.
3. Probar Error.message, objetos anidados, query strings en request.originalUrl, validation property names y body remoto malicioso. Sanitizar instance para ruta sin query sensible; evitar errores de campo arbitrario que reimpriman secretos.
4. Crear spans HTTP explícitos y propagar contexto durante operación, con atributos allowlist method/ruta-template/status/traceId. No body/headers sensibles. Añadir eventos para decisiones de dependencia sin nombres de cuenta.
5. Verificar mismo traceId en header/Problem/log, incluso rechazo guard; OTLP falla sin producir log con payload crudo ni bloquear tráfico. Startup error usa código seguro, no error.message sin filtrar.
6. Comprobar shutdown telemetry en señal normal, no solo bootstrap.catch; test del cierre sin handles. Registrar hallazgos y correcciones con prueba de regresión.

## Criterios de aceptación

- [ ] Cero marcadores sensibles en sinks de observabilidad/errores.
- [ ] Trazas realmente generadas y correlacionadas; no solo SDK configurado.
- [ ] Las respuestas contractuales legítimas permanecen intactas.

## Comprobación

```sh
npm run test --workspace @stayhub/auth-service -- --selectProjects security --runTestsByPath test/security/no-secret-leakage.spec.ts
npm run typecheck
npm run lint
```

No añadir datos personales a métricas, logs o atributos para facilitar debugging.

Al terminar, crear `agents/AUTH-083/resultado.md` con cambios, pruebas y bloqueos. No declarar como ejecutada una prueba pendiente de infraestructura. El estado del plan solo cambia cuando sus criterios se verifican.

