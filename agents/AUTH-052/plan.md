# AUTH-052 — Pruebas unitarias de LoginUseCase

Estado inicial: pendiente. Tipo: Pruebas unitarias.

## Resultado esperado y evidencia

Existe Argon2PasswordHasher.verifyWithEquivalentCost, pero no caso de uso ni prueba de ramas de identidad/estado.

## Preparación

Leer [reglas compartidas](../decisiones.md): D01, D02, D04–D06, D08–D10, y [auditoría](../auditoria.md). Ejecutar desde la raíz del repositorio.

Dependencias: [PRE-001](../PRE-001/plan.md), [PRE-004](../PRE-004/plan.md).

## Archivos concretos

- `apps/auth-service/test/unit/login.use-case.spec.ts`
- `apps/auth-service/test/unit/argon2-password-hasher.spec.ts`

## Pasos de ejecución

1. Preparar puertos dobles para Users, Credential, rate limiter, UoW, issuer y Clock; probar GUEST/OWNER/ADMIN preaprovisionado.
2. Para Users 404, User no ACTIVE, credencial ausente/PENDING/REVOKED y password incorrecta, exigir mismo InvalidCredentialsError y cero Session/Refresh.
3. Demostrar verifyWithEquivalentCost ejecutado con null en ramas sin hash activo; incluso si devuelve true para hash señuelo, ninguna identidad inexistente se autentica.
4. Probar normalización del correo enviado al adapter sin modificar password; email nuevo se resuelve cada login y nunca se lee una copia Auth.
5. Probar contador1–5, sexto 429, bloqueo previo con6, limpieza en éxito y 503 por Redis/Users/DB. Redis falla al limpiar: no queda sesión confirmada.
6. Test separado del hasher con Argon2 real y configuración test razonable: exactitud password, algoritmo Argon2id, hash inválido=false. No hacer aserción frágil de tiempos iguales.

## Criterios de aceptación

- [ ] Todas las ramas negativas conservan 401 genérico o 503 por dependencia y no crean tokens.
- [ ] La seguridad no depende solo del boolean del hasher.

## Comprobación

```sh
npm run typecheck
npm run test --workspace @stayhub/auth-service -- --selectProjects unit --runTestsByPath test/unit/login.use-case.spec.ts
```

Mantener expiración absoluta, rol inmutable y límites de Auth. No implementar cookie Gateway ni acceso a users_db.

Al terminar, crear `agents/AUTH-052/resultado.md` con cambios, pruebas y bloqueos. No declarar como ejecutada una prueba pendiente de infraestructura. Registrar RED esperado antes de implementar y GREEN después; el cierre funcional pertenece al plan de verificación de la historia.
