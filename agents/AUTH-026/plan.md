# AUTH-026 — Pruebas HTTP del registro

Estado inicial: pendiente. Tipo: Pruebas de contrato.

## Resultado esperado y evidencia

No existe registration.contract.spec.ts ni RegistrationController. RegisterRequest y RegisterResponse sí existen; no normalizan entradas.

## Preparación

Leer [reglas compartidas](../decisiones.md): D01–D03, D07–D10, y [auditoría](../auditoria.md). Ejecutar desde la raíz del repositorio.

Dependencias: [PRE-001](../PRE-001/plan.md), [PRE-004](../PRE-004/plan.md).

## Archivos concretos

- `apps/auth-service/test/contract/registration.contract.spec.ts`
- `apps/auth-service/test/helpers/auth-app.ts`
- `apps/auth-service/test/helpers/crypto-fixture.ts`

## Pasos de ejecución

1. Usar TestModule con configuración HTTP real, service JWT real y stub tipado de RegisterAccount. Preparar el test compilable antes de crear el controlador; registrar 404 esperado como RED de ruta ausente.
2. Probar body válido para GUEST y OWNER, Idempotency-Key UUID obligatorio, 201 y solo id/name/email/role; asegurar que el caso de uso recibe el mismo UUID y traceId.
3. Tabla de 400: key ausente/no UUID, nombre vacío/1/101 tras trim, correo inválido/>254, password 7/129 puntos de código, ADMIN, campos extra y null. Contraseña de 8/128 y con espacios/Unicode se transmite exacta; nombre/correo con espacios exteriores se aceptan normalizados.
4. Probar 401 sin service JWT, firmado con clave equivocada, issuer/audience/scope incorrecto o vencido; comprobar que no se invoca execute.
5. Dobles del caso de uso producen IdempotencyConflictError, conflicto de correo y DependencyUnavailableError: comprobar 409/503, application/problem+json y traceId consistente. Reejecutar contra controlador de AUTH-045.

## Criterios de aceptación

- [ ] Matriz prueba ambos roles y límites exactos sin modificar la contraseña.
- [ ] Rechazos del guard/pipes no ejecutan negocio.
- [ ] Se conserva evidencia RED y luego GREEN al conectar AUTH-045.

## Comprobación

```sh
npm run typecheck
npm run test --workspace @stayhub/auth-service -- --selectProjects contract --runTestsByPath test/contract/registration.contract.spec.ts
```

No modificar Users/Gateway. Los contratos candidatos se prueban localmente; las tareas de integración externa certifican al proveedor real.

Al terminar, crear `agents/AUTH-026/resultado.md` con cambios, pruebas y bloqueos. No declarar como ejecutada una prueba pendiente de infraestructura. Registrar RED esperado antes de implementar y GREEN después; el cierre funcional pertenece al plan de verificación de la historia.

