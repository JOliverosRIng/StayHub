# AUTH-075 — Comparar Swagger generado con contrato Auth

Estado inicial: pendiente. Tipo: Verificación de contrato automatizada.

## Resultado esperado y evidencia

scripts/check-auth-openapi-syntax.mjs solo comprueba versión y cuatro paths; no detecta cambio de schemas, guards ni respuestas.

## Preparación

Leer [reglas compartidas](../decisiones.md): D01, D02, D09, D10, y [auditoría](../auditoria.md). Ejecutar desde la raíz del repositorio.

Dependencias: [AUTH-047](../AUTH-047/plan.md), [AUTH-073](../AUTH-073/plan.md).

## Archivos concretos

- `scripts/validate-auth-openapi.mjs`
- `apps/auth-service/test/contract/openapi-drift.spec.ts`
- `apps/auth-service/test/helpers/auth-app.ts`
- `apps/auth-service/src/interfaces/openapi/openapi.factory.ts`
- `package.json`
- `.github/workflows/ci.yml`

## Pasos de ejecución

1. Generar JSON desde createAuthOpenApi sobre controladores/módulos productivos; override dependencias de I/O con fixtures para no necesitar DB solo para exportar. No construir manualmente un OpenAPI simulado.
2. Script validate-auth-openapi recibe ruta del JSON generado y compara con YAML mediante parser yaml ya instalado. Resolver $ref locales; normalizar orden, tags/description y nombres de schemas equivalentes sin ignorar required/enum/types/límites/additionalProperties/security/respuestas.
3. Comparar exactamente cuatro paths internos, operationIds, method POST, serviceAuth, Idempotency-Key, status/media types/Retry-After y schemas. Comparar también health documentado o excluirlo explícitamente en ambos con una prueba separada; no permitir rutas funcionales extra.
4. Pruebas negativas mutan copia del documento: quitar 401, permitirADMIN en registro, quitar required, cambiar 3600 o eliminar serviceAuth debe hacer fallar el script. No mutar archivos fuente durante test.
5. Integrar ejecución de comparación en npm run openapi:check conservando el chequeo de sintaxis útil; añadir pasos y filtros de paths para scripts/config en CI. Generación puede ser un test/helper con salida temporal y comando documentado.
6. Revisar excepciones legítimas de name/email y tokens en respuestas según D02; “sin secretos” no significa borrar access/refresh del contrato de emisión.

## Criterios de aceptación

- [ ] Un cambio incompatible de Swagger o YAML falla el comando CI.
- [ ] No basta comparación de nombres ni snapshot vacío.
- [ ] Documentos generados de prueba no quedan versionados como fuente de verdad.

## Comprobación

```sh
npm run openapi:check
npm run test --workspace @stayhub/auth-service -- --selectProjects contract --runTestsByPath test/contract/openapi-drift.spec.ts
```

No reescribir OpenAPI público/Users desde este comparador.

Al terminar, crear `agents/AUTH-075/resultado.md` con cambios, pruebas y bloqueos. No declarar como ejecutada una prueba pendiente de infraestructura. El estado del plan solo cambia cuando sus criterios se verifican.
