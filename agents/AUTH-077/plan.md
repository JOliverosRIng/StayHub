# AUTH-077 — Verificar contrato real de lookup Users

Estado inicial: pendiente. Tipo: Contrato externo; requiere proveedor G2.

## Resultado esperado y evidencia

Lookup está documentado, pero no hay implementación provider local. AUTH-063 solo puede probarlo contra stub inicialmente.

## Preparación

Leer [reglas compartidas](../decisiones.md): D01, D02, D05, D07, D09, y [auditoría](../auditoria.md). Ejecutar desde la raíz del repositorio.

Dependencias: [AUTH-074](../AUTH-074/plan.md).

## Archivos concretos

- `apps/auth-service/test/contract/users-login-identity.consumer.spec.ts`
- `apps/auth-service/README.md`

## Pasos de ejecución

1. Requerir USERS_CONTRACT_BASE_URL y fixtures G2 con identidades ACTIVE/PENDING/CANCELLED, tres roles y email modificable. Registrar commit/provider; no preparar datos mediante SQL ajeno.
2. Invocar UsersLoginIdentityClient real sobre correo normalizado: respuesta solo userId/role/status ACTIVE; PENDING/CANCELLED/ausente se resuelven como 404, nunca autenticables.
3. Preparar cambio de email mediante fixture o endpoint de perfil autorizado de G2; correo nuevo funciona y viejo 404; variantes trim/case normalizadas resuelven mismo userId.
4. Probar invalid service JWT, cuerpo extra, proveedor5xx y respuesta inválida con harness de fallo; afirmar mapping 404→null y resto dependencia 503.
5. Guardar evidencia de contrato y fixture sintético. Sin proveedor real dejar preparación hecha y bloqueo externo, no test.skip exitoso.

## Criterios de aceptación

- [ ] Provider entrega identidad mínima vigente sin dependencia de perfil/Auth DB.
- [ ] Estados no activos nunca retornan ACTIVE200.
- [ ] Cambio de email tiene evidencia observable.

## Comprobación

```sh
npm run test:cross-service --workspace @stayhub/auth-service -- --selectProjects contract --runTestsByPath test/contract/users-login-identity.consumer.spec.ts
```

No construir un endpoint administrativo para estas pruebas.

Al terminar, crear `agents/AUTH-077/resultado.md` con cambios, pruebas y bloqueos. No declarar como ejecutada una prueba pendiente de infraestructura. El estado del plan solo cambia cuando sus criterios se verifican.
