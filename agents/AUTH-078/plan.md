# AUTH-078 — Verificar expectativas del Gateway sobre Auth

Estado inicial: pendiente. Tipo: Contrato externo; requiere expectativas G1.

## Resultado esperado y evidencia

Existe OpenAPI público pero no cliente Gateway. Auth recibe service JWT y entrega tokens internos distintos de la respuesta pública.

## Preparación

Leer [reglas compartidas](../decisiones.md): D01, D02, D09, D10, y [auditoría](../auditoria.md). Ejecutar desde la raíz del repositorio.

Dependencias: [AUTH-075](../AUTH-075/plan.md).

## Archivos concretos

- `apps/auth-service/test/contract/gateway.provider.spec.ts`
- `apps/auth-service/README.md`
- `specs/001-fundamentos-identidad/contracts/openapi-auth-service.yaml (lectura)`
- `specs/001-fundamentos-identidad/contracts/openapi-public.yaml (lectura)`

## Pasos de ejecución

1. Obtener fixture/expectativas versionadas del consumidor G1 para los cuatro handlers, auth:invoke y Problem Details. Preparar harness contra Auth real con dependencias locales de Auth.
2. Comprobar registro 201, login 200, refresh 200 y validate 200; body interno refresh en JSON, respuesta InternalTokenPair y role de sesión.
3. Probar 401 por service JWT,400 shape,409 key/correo,429 Retry-After y 503 dependencia. x-trace-id se conserva; no propagar texto de error interno.
4. Verificar que G1 espera mapear principal a user, añadir tokenType Bearer y poner refresh en cookie; la suite provider solo valida payload entregado a G1, no implementa esas transformaciones en Auth.
5. Ejecutar expectativas G1 contra el provider Auth; guardar versión de ambos contratos y resultado. Si solo hay expectativas inventadas localmente, declarar pendiente validación G1.

## Criterios de aceptación

- [ ] Expectativas consumidor y provider Auth verificadas con versiones identificadas.
- [ ] No confundir JWT de usuario con service JWT ni cookies con body interno.
- [ ] No se modifica contrato público por conveniencia local.

## Comprobación

```sh
npm run test:cross-service --workspace @stayhub/auth-service -- --selectProjects contract --runTestsByPath test/contract/gateway.provider.spec.ts
```

La transformación pública y la cookie pertenecen al Gateway.

Al terminar, crear `agents/AUTH-078/resultado.md` con cambios, pruebas y bloqueos. No declarar como ejecutada una prueba pendiente de infraestructura. El estado del plan solo cambia cuando sus criterios se verifican.
