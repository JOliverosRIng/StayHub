# AUTH-057 — Pruebas de validación y caché de sesión

Estado inicial: pendiente. Tipo: Pruebas de integración.

## Resultado esperado y evidencia

AuthCache guarda JSON con TTL arbitrario y no existe validación de sesión. El body de introspección no lleva exp.

## Preparación

Leer [reglas compartidas](../decisiones.md): D01, D02, D04–D06, D08–D10, y [auditoría](../auditoria.md). Ejecutar desde la raíz del repositorio.

Dependencias: [PRE-003](../PRE-003/plan.md), [PRE-004](../PRE-004/plan.md).

## Archivos concretos

- `apps/auth-service/test/integration/session-validation.spec.ts`

## Pasos de ejecución

1. Crear sesiones activas, revocadas y expiradas en PostgreSQL; validar userId correcto y mismatch con respuestas esperadas 401.
2. Guardar caché ACTIVE obsoleta, revocar en DB y comprobar rechazo inmediato; eliminar caché y repetir para demostrar autoridadDB.
3. DB no disponible con cache hit ACTIVE debe 503; Redis no disponible con DB activa puede 200. JSON corrupto de caché debe ignorarse, no 500.
4. Sin accessTokenExpiresAt (ruta HTTP actual), comprobar que no se escribe caché positiva. Con expiry confiable local, TTL <=min(exp-now,absoluteExpiry-now), sin TTL<=0.
5. Cambiar rol simulado de Users sin tocar sesión: resultado conserva rol original y no llama Users. Sesión revocada por replay inmediatamente inválida.
6. Reejecutar tras AUTH-068; parametrizar tres roles sin crear una ruta productiva especial.

## Criterios de aceptación

- [ ] Ningún cache hit evita comprobar revocación autoritativa.
- [ ] Las políticas Redis cache vs rate limit quedan diferenciadas.
- [ ] Se respeta contrato HTTP sin inventar exp.

## Comprobación

```sh
npm run typecheck
npm run test --workspace @stayhub/auth-service -- --selectProjects integration --runTestsByPath test/integration/session-validation.spec.ts
```

Mantener expiración absoluta, rol inmutable y límites de Auth. No implementar cookie Gateway ni acceso a users_db.

Al terminar, crear `agents/AUTH-057/resultado.md` con cambios, pruebas y bloqueos. No declarar como ejecutada una prueba pendiente de infraestructura. Registrar RED esperado antes de implementar y GREEN después; el cierre funcional pertenece al plan de verificación de la historia.
