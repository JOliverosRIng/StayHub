# AUTH-065 — Implementar login y creación atómica de sesión

Estado inicial: pendiente. Tipo: Implementación caso de uso.

## Resultado esperado y evidencia

Credenciales/hasher/repositorios existen; no hay flujo que resuelva Users y cree sesión. La tarea original no explicita dependencia del emisor AUTH-066.

## Preparación

Leer [reglas compartidas](../decisiones.md): D01, D02, D04–D06, D08–D10, y [auditoría](../auditoria.md). Ejecutar desde la raíz del repositorio.

Dependencias: [AUTH-052](../AUTH-052/plan.md), [AUTH-063](../AUTH-063/plan.md), [AUTH-064](../AUTH-064/plan.md), [AUTH-066](../AUTH-066/plan.md).

## Archivos concretos

- `apps/auth-service/src/application/login/login.use-case.ts`
- `apps/auth-service/src/application/ports/auth-use-cases.port.ts`
- `apps/auth-service/test/unit/login.use-case.spec.ts`
- `apps/auth-service/test/integration/login-persistence.spec.ts`

## Pasos de ejecución

1. Implementar execute({email,password,traceId}) con puertos sin Nest: rate limiter, Users lookup, Credential repository, issuer y SessionUnitOfWork.
2. Orden: normalize email →inspect rate limit →Users →Credential activa o null →verifyWithEquivalentCost(hash|null,password). Error de dependencia 503 no incrementa fallos de credencial.
3. Si identidad/credencial ausente/inactiva o hash falla, registrar fallo atómico y devolver 401 salvo sexto 429. Proteger rama dummy=true explícitamente.
4. En éxito preparar sesión/tokens con AUTH-066, insertar Session+Refresh en UoW; limpiar contador antes de commit. Si falla clear o persistencia, rollback y 503; no devolver tokens preparados.
5. Retornar contrato InternalTokenPair con principal de la Session, no datos del cliente. Argon2 password exacta. Nunca guardar correo o consultar users_db.
6. Probar integración con PostgreSQL/Redis reales, stub Users, éxito tres roles, falta credencial, Redis clear fallido y conflicto técnico de persistencia.

## Criterios de aceptación

- [ ] Solo User ACTIVE + Credential ACTIVE crea sesión.
- [ ] La sesión y primer refresh existen juntos, tokens solo después de commit.
- [ ] No permite enumeración por mensaje/código.

## Comprobación

```sh
npm run typecheck
npm run test --workspace @stayhub/auth-service -- --selectProjects unit --runTestsByPath test/unit/login.use-case.spec.ts
```

Mantener expiración absoluta, rol inmutable y límites de Auth. No implementar cookie Gateway ni acceso a users_db.

Al terminar, crear `agents/AUTH-065/resultado.md` con cambios, pruebas y bloqueos. No declarar como ejecutada una prueba pendiente de infraestructura. El estado del plan solo cambia cuando sus criterios se verifican.
