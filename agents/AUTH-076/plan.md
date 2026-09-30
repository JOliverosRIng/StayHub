# AUTH-076 — Verificar contrato de registro del proveedor Users

Estado inicial: pendiente. Tipo: Contrato externo; requiere proveedor G2.

## Resultado esperado y evidencia

No hay servicio Users en el repo y el GET candidato aún no está en su OpenAPI. Stubs locales no acreditan compatibilidad provider.

## Preparación

Leer [reglas compartidas](../decisiones.md): D01–D03, D07, D09, y [auditoría](../auditoria.md). Ejecutar desde la raíz del repositorio.

Dependencias: [AUTH-048](../AUTH-048/plan.md), [PRE-004](../PRE-004/plan.md).

## Archivos concretos

- `apps/auth-service/test/contract/users-registration.consumer.spec.ts`
- `agents/contrato-users-candidato.md`
- `apps/auth-service/README.md`
- `apps/auth-service/package.json`

## Pasos de ejecución

1. Preparar una suite consumer ejecutable contra USERS_CONTRACT_BASE_URL con service JWT sintético válido para fixture G2. Reutilizar UsersRegistrationClient real.
2. Requerir versión/commit del contrato G2 y confirmación de GET registro. Si falta, registrar BLOQUEADO EXTERNO en resultado con endpoint/shape exacto; la suite preparada no cierra tarea.
3. Crear GUEST/OWNER con registrationId/userId controlados; comprobar create 201 repetido, get 200, activate 200 repetido y cancel 204 idempotente para otra identidad PENDING. Caso ACTIVE no debe cancelarse.
4. Verificar id→userId, name/email/role/status y aislamiento de otra key; rechazo de datos inconsistentes o duplicación de correo. No enviar password jamás.
5. Comprobar service JWT inválido, traceId, timeout e idempotencia. Fallos de red se inducen con proxy/harness aislado, no deteniendo un servicio compartido.
6. Agregar comando test:cross-service con selección específica; si env/provider falta, falla precondición de forma explícita. Registrar versión y evidencia que permita repetir la suite.

## Criterios de aceptación

- [ ] El proveedor real satisface métodos y schemas consumidos por Auth.
- [ ] G2 aceptó/publicó el GET; de lo contrario estado bloqueado visible.
- [ ] No se presenta un stub como provider certificado.

## Comprobación

```sh
npm run test:cross-service --workspace @stayhub/auth-service -- --selectProjects contract --runTestsByPath test/contract/users-registration.consumer.spec.ts
```

G2 entrega provider y fixtures; Auth no implementa sus endpoints ni consulta users_db.

Al terminar, crear `agents/AUTH-076/resultado.md` con cambios, pruebas y bloqueos. No declarar como ejecutada una prueba pendiente de infraestructura. El estado del plan solo cambia cuando sus criterios se verifican.
