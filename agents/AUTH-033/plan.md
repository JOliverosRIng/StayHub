# AUTH-033 — Pruebas y corrección de secretos en registro

Estado inicial: pendiente. Tipo: Pruebas de seguridad con corrección acotada.

## Resultado esperado y evidencia

AuthLogger devuelve Error.message directamente y solo identifica secretos por nombres de campos; el filtro le pasa la excepción completa.

## Preparación

Leer [reglas compartidas](../decisiones.md): D01–D03, D07–D10, y [auditoría](../auditoria.md). Ejecutar desde la raíz del repositorio.

Dependencias: [PRE-001](../PRE-001/plan.md), [PRE-004](../PRE-004/plan.md).

## Archivos concretos

- `apps/auth-service/test/security/registration-secrets.spec.ts`
- `apps/auth-service/src/infrastructure/observability/auth-logger.ts`
- `apps/auth-service/src/interfaces/http/problem.filter.ts`
- `apps/auth-service/src/interfaces/http/trace.interceptor.ts`

## Pasos de ejecución

1. Capturar stdout, stderr y emitTelemetryLog con fixtures sintéticos distintivos para password/hash/service JWT/email. Cubrir objetos anidados, arrays y Error cuyo message contiene cada secreto.
2. Aplicar política de logging por eventos/códigos y campos permitidos; errores desconocidos solo nombre/clasificación segura, nunca message/stack crudo. No intentar detectar cualquier secreto arbitrario solo con regex.
3. Evitar enviar exception cruda desde ProblemDetailsFilter; registrar code/status/traceId. Preservar same traceId en fallos de guard por middleware PRE-001.
4. Probar respuesta 201 permite name/email del resumen, pero no password/hash/estado de saga; errores no incluyen PII. Probar Users retorna error con secretos y su texto no se reenvía.
5. Completar recorridos de saga reales cuando AUTH-042/045 exista. No prohibir name/email en respuesta exitosa de registro: el contrato los exige.

## Criterios de aceptación

- [ ] Los marcadores sintéticos no aparecen en ningún destino de logs.
- [ ] Errores 400/409/503 no exponen payload/PII.
- [ ] La salida 201 respeta la excepción contractual.

## Comprobación

```sh
npm run typecheck
npm run test --workspace @stayhub/auth-service -- --selectProjects security --runTestsByPath test/security/registration-secrets.spec.ts
```

No modificar Users/Gateway. Los contratos candidatos se prueban localmente; las tareas de integración externa certifican al proveedor real.

Al terminar, crear `agents/AUTH-033/resultado.md` con cambios, pruebas y bloqueos. No declarar como ejecutada una prueba pendiente de infraestructura. Registrar RED esperado antes de implementar y GREEN después; el cierre funcional pertenece al plan de verificación de la historia.

