# AUTH-080 — Integración real de login Auth↔Users

Estado inicial: pendiente. Tipo: Integración externa; requiere Compose G2.

## Resultado esperado y evidencia

No se ha ejecutado login con Users real ni comprobado propagación inmediata de cambios de correo.

## Preparación

Leer [reglas compartidas](../decisiones.md): D01, D02, D05, D09, y [auditoría](../auditoria.md). Ejecutar desde la raíz del repositorio.

Dependencias: [AUTH-077](../AUTH-077/plan.md).

## Archivos concretos

- `apps/auth-service/test/integration/cross-service-login.spec.ts`
- `apps/auth-service/README.md`
- `agents/AUTH-080/resultado.md`

## Pasos de ejecución

1. Usar Compose aislado y fixtures G2 para estados ACTIVE/PENDING/CANCELLED y ADMIN preaprovisionado. Sembrar Credential solo en auth_db test; no aprovisionar admin público.
2. Login correcto crea sesión/refresh, role viene del lookup. CredencialPENDING/REVOKED, password incorrecta y Users no activo producen 401 y cero sesiones nuevas.
3. Probar case/trim del email y cambio real mediante interfaz de perfil de G2: nuevo email válido inmediatamente, antiguo 401.
4. Simular Users lento/caído mediante proxy del proyecto test:503 genérico y contador de credenciales no incrementado por indisponibilidad.
5. Ejecutar límite por identificador con cuenta existente e inexistente, comprobar mensajes y Argon2 por evidencia de invocación, no tiempos exactos de red.
6. Registrar versiones, fixture IDs sintéticos y pruebas; missing provider deja bloqueo externo explícito.

## Criterios de aceptación

- [ ] Login depende de identidad vigente y credencial activa.
- [ ] Cambio de correo y caída de Users se reflejan correctamente.
- [ ] Ninguna PII real queda en evidencia.

## Comprobación

```sh
npm run test:cross-service --workspace @stayhub/auth-service -- --selectProjects integration --runTestsByPath test/integration/cross-service-login.spec.ts
```

No invadir perfil ni persistencia del Grupo2.

Al terminar, crear `agents/AUTH-080/resultado.md` con cambios, pruebas y bloqueos. No declarar como ejecutada una prueba pendiente de infraestructura. El estado del plan solo cambia cuando sus criterios se verifican.
