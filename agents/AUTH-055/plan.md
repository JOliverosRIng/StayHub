# AUTH-055 — Pruebas SQL de rotación, replay y concurrencia

Estado inicial: pendiente. Tipo: Pruebas de integración.

## Resultado esperado y evidencia

Existe índice parcial ACTIVE, pero no algoritmo de rotación ni pruebas que acrediten transacción común.

## Preparación

Leer [reglas compartidas](../decisiones.md): D01, D02, D04–D06, D08–D10, y [auditoría](../auditoria.md). Ejecutar desde la raíz del repositorio.

Dependencias: [PRE-003](../PRE-003/plan.md).

## Archivos concretos

- `apps/auth-service/test/integration/refresh-rotation.spec.ts`
- `apps/auth-service/test/integration/dependencies.setup.ts`

## Pasos de ejecución

1. Sembrar Session activa y un refresh hash; rotar por el use case de AUTH-067 cuando exista, usando PostgreSQL real y claves reales o firmante de prueba explícito.
2. Asertar viejo CONSUMED, consumedAt, enlace a un único sucesor ACTIVE y expiración igual al login+7d; verificar HMAC sin raw token almacenado.
3. Con dos conexiones y barrera, lanzar dos rotaciones del mismo raw token. Como máximo una respuesta 200; la otra 401 por replay; sesión queda revocada y cero tokens ACTIVE.
4. Reutilizar token antiguo tras varias rotaciones: toda la sesión/familia se revoca; otra sesión del mismo usuario sigue activa.
5. Inyectar fallo de firma/insert/commit y verificar rollback; replay exitosamente detectado se COMMIT antes del error 401 y sigue revocado tras nueva consulta.
6. Probar exactos expiry, unknown/revoked, asociación a sesión y pérdida de Redis al invalidar caché. Una caché stale nunca permite autenticarse AUTH-068.

## Criterios de aceptación

- [ ] No usar mock de Prisma ni sleeps como mecanismo de sincronización.
- [ ] El test diferencia rollback técnico de commit de revocación.
- [ ] No aparece un segundo refresh ACTIVE por sesión.

## Comprobación

```sh
npm run typecheck
npm run test --workspace @stayhub/auth-service -- --selectProjects integration --runTestsByPath test/integration/refresh-rotation.spec.ts
```

Mantener expiración absoluta, rol inmutable y límites de Auth. No implementar cookie Gateway ni acceso a users_db.

Al terminar, crear `agents/AUTH-055/resultado.md` con cambios, pruebas y bloqueos. No declarar como ejecutada una prueba pendiente de infraestructura. Registrar RED esperado antes de implementar y GREEN después; el cierre funcional pertenece al plan de verificación de la historia.
