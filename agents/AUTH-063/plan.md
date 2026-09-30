# AUTH-063 — Implementar lookup de identidad para login

Estado inicial: pendiente. Tipo: Implementación adapter.

## Resultado esperado y evidencia

El contrato Users ya define POST /internal/v1/login-identities/resolve. Falta adapter que implemente resolveLoginIdentity.

## Preparación

Leer [reglas compartidas](../decisiones.md): D01, D02, D04–D06, D08–D10, y [auditoría](../auditoria.md). Ejecutar desde la raíz del repositorio.

Dependencias: [PRE-001](../PRE-001/plan.md), [PRE-004](../PRE-004/plan.md).

## Archivos concretos

- `apps/auth-service/src/infrastructure/http/users-login-identity.client.ts`
- `apps/auth-service/src/application/ports/users-service.port.ts`
- `apps/auth-service/test/contract/users-login-identity-adapter.spec.ts`

## Pasos de ejecución

1. Implementar resolveLoginIdentity(normalizedEmail,traceId) sobre transporte existente con body {email}, service JWT y idempotent:true porque solo consulta.
2. Validar respuesta 200 en runtime: userId UUID, role allowlist, status ACTIVE; retornar solo esos campos aunque proveedor agregue perfil.
3. 404 retorna null. 200 con PENDING/CANCELLED viola contrato →DependencyUnavailableError; un fake de aplicación puede representar ausencia para estados inactivos, no aceptar datos inválidos del provider.
4. Timeout, circuito,5xx,401/403 remotos o JSON inválido →503 vía error de aplicación. No convertir cualquier error en InvalidCredentials.
5. Probar stub HTTP con request normalizado, headers y shape mínimo; Auth no conserva email en DB/log/cache crudos. Pruebas de cambio de email resuelven siempre al proveedor.

## Criterios de aceptación

- [ ] Solo 404 equivale a identidad no encontrada.
- [ ] Lookup no recupera perfil ni accede users_db.

## Comprobación

```sh
npm run typecheck
npm run test --workspace @stayhub/auth-service -- --selectProjects contract --runTestsByPath test/contract/users-login-identity-adapter.spec.ts
```

Mantener expiración absoluta, rol inmutable y límites de Auth. No implementar cookie Gateway ni acceso a users_db.

Al terminar, crear `agents/AUTH-063/resultado.md` con cambios, pruebas y bloqueos. No declarar como ejecutada una prueba pendiente de infraestructura. El estado del plan solo cambia cuando sus criterios se verifican.
