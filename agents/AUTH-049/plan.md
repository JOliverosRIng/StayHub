# AUTH-049 — Pruebas HTTP de login

Estado inicial: pendiente. Tipo: Pruebas de contrato.

## Resultado esperado y evidencia

Hay LoginRequest/InternalTokenPairResponse, pero no LoginController ni pruebas HTTP; email se valida antes de recortarse.

## Preparación

Leer [reglas compartidas](../decisiones.md): D01, D02, D04–D06, D08–D10, y [auditoría](../auditoria.md). Ejecutar desde la raíz del repositorio.

Dependencias: [PRE-001](../PRE-001/plan.md), [PRE-004](../PRE-004/plan.md).

## Archivos concretos

- `apps/auth-service/test/contract/login.contract.spec.ts`
- `apps/auth-service/test/helpers/auth-app.ts`
- `apps/auth-service/test/helpers/crypto-fixture.ts`

## Pasos de ejecución

1. Preparar app con guard/pipe/filtro reales y doble tipado de LoginUseCase. Antes de controlador registrar RED por ruta ausente, no por error de importación.
2. Probar POST /internal/v1/login con service JWT: 200 y shape InternalTokenPair completo, expiresIn número entero 3600, expiry ISO, principal con UUID/role; sin Set-Cookie.
3. Probar email con mayúsculas/espacios exteriores y contraseña exacta; body con role/userId/extra/null y email inválido devuelve 400 antes del use case.
4. Simular InvalidCredentialsError idéntico para correo ausente/password errónea/inactivo; 401 genérico sin indicar existencia.
5. Probar 429 con Retry-After entero>=1 y Problem.code LOGIN_RATE_LIMITED, dependencia 503, service JWT inválido 401. Contrato debe añadir 400 faltante en AUTH-073.
6. Reejecutar con controlador real AUTH-071; comparar el JSON usando schemas y no snapshots de tokens aleatorios.

## Criterios de aceptación

- [ ] Éxito, validación, antiabuso y autenticación de servicio están cubiertos.
- [ ] Los tokens solo aparecen en éxito esperado, nunca logs o errores.

## Comprobación

```sh
npm run typecheck
npm run test --workspace @stayhub/auth-service -- --selectProjects contract --runTestsByPath test/contract/login.contract.spec.ts
```

Mantener expiración absoluta, rol inmutable y límites de Auth. No implementar cookie Gateway ni acceso a users_db.

Al terminar, crear `agents/AUTH-049/resultado.md` con cambios, pruebas y bloqueos. No declarar como ejecutada una prueba pendiente de infraestructura. Registrar RED esperado antes de implementar y GREEN después; el cierre funcional pertenece al plan de verificación de la historia.
