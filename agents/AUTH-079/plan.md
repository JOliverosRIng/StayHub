# AUTH-079 — Integración real de registro Auth↔Users

Estado inicial: pendiente. Tipo: Integración externa; requiere Compose G2.

## Resultado esperado y evidencia

Compose actual solo define Auth, auth-db, auth-migrate y auth-redis; no hay Users ni su DB en este repo.

## Preparación

Leer [reglas compartidas](../decisiones.md): D01–D03, D07, D09, y [auditoría](../auditoria.md). Ejecutar desde la raíz del repositorio.

Dependencias: [AUTH-076](../AUTH-076/plan.md).

## Archivos concretos

- `apps/auth-service/test/integration/cross-service-registration.spec.ts`
- `apps/auth-service/README.md`
- `agents/AUTH-079/resultado.md`

## Pasos de ejecución

1. Conectar Auth y Users reales en un proyecto Compose de integración aislado entregado por G1/G2. Registrar imágenes/commits/contratos; no modificar ni apagar ambientes compartidos.
2. Registrar GUEST/OWNER con service JWT y key; comprobar 201, repetición misma identidad, key con payload distinto 409 y correo equivalente con otra key 409.
3. Verificar User ACTIVE mediante GET registro G2 y Credential/Registration por auth_db test; nunca consultar users_db.
4. Introducir timeout después de crear o activar User usando proxy de prueba; reiniciar solo Auth de ese proyecto y reintentar misma key. Verificar convergencia y ausencia de credenciales huérfanas autenticables.
5. Probar reconciliación sin request original en fases recuperables y compensación de PENDING expirado; comprobar que User ACTIVE no se cancela.
6. Sin provider/contrato GET aceptado, entregar suite y registrar bloqueo; no sustituir Users real por stub para declarar integración.

## Criterios de aceptación

- [ ] Registro durable probado entre procesos reales y con reinicio.
- [ ] Solo una identidad/credencial y sin éxito parcial.
- [ ] Evidencia de fallo/recuperación y límites de ownership.

## Comprobación

```sh
npm run test:cross-service --workspace @stayhub/auth-service -- --selectProjects integration --runTestsByPath test/integration/cross-service-registration.spec.ts
```

Destrucción/limpieza solo de recursos test identificados por este harness.

Al terminar, crear `agents/AUTH-079/resultado.md` con cambios, pruebas y bloqueos. No declarar como ejecutada una prueba pendiente de infraestructura. El estado del plan solo cambia cuando sus criterios se verifican.
