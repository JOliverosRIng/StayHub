# AUTH-056 — Pruebas reales de rate limit Redis

Estado inicial: pendiente. Tipo: Pruebas de integración.

## Resultado esperado y evidencia

AuthCache incrementa con MULTI pero no lee count/TTL. No hay rate limiter, secreto HMAC dedicado ni Retry-After HTTP.

## Preparación

Leer [reglas compartidas](../decisiones.md): D01, D02, D04–D06, D08–D10, y [auditoría](../auditoria.md). Ejecutar desde la raíz del repositorio.

Dependencias: [PRE-001](../PRE-001/plan.md).

## Archivos concretos

- `apps/auth-service/test/integration/login-rate-limit.spec.ts`
- `apps/auth-service/test/helpers/auth-app.ts`

## Pasos de ejecución

1. Usar Redis 7 aislado DB15 y secret sintético. Sembrar/limpiar por namespace test; demostrar que ninguna key contiene email crudo.
2. Cinco fallos 401, sexto 429, Retry-After entre1 y 900, intentos adicionales no prolongan TTL. Probar email normalizado con variantes de case/espacios comparte contador.
3. Antes del sexto fallo un login válido limpia contador; con contador>=6 cualquier intento queda 429 hasta expirar. Misma política para cuenta existente/inexistente.
4. Para vencimiento usar PEXPIRE corto o adelantar TTL en Redis test, no reloj falso que no cambia el servidor Redis; verificar nueva ventana.
5. Lanzar fallos concurrentes y comprobar count exacto y TTL presente, incluso primer INCR concurrente; mostrar que el script Lua de AUTH-064 lo resuelve.
6. Cortar conexión Redis/controlar cliente apuntando a puerto cerrado:503 sin crear sesión. Probar error al clear y rollback del login. Reejecutar tras AUTH-064/065.

## Criterios de aceptación

- [ ] Ventana fija y cabecera derivada del TTL, sin hardcode 900 para cada respuesta.
- [ ] Redis no disponible nunca deja pasar autenticación.
- [ ] Todos los escenarios corren sobre Redis real.

## Comprobación

```sh
npm run typecheck
npm run test --workspace @stayhub/auth-service -- --selectProjects integration --runTestsByPath test/integration/login-rate-limit.spec.ts
```

Mantener expiración absoluta, rol inmutable y límites de Auth. No implementar cookie Gateway ni acceso a users_db.

Al terminar, crear `agents/AUTH-056/resultado.md` con cambios, pruebas y bloqueos. No declarar como ejecutada una prueba pendiente de infraestructura. Registrar RED esperado antes de implementar y GREEN después; el cierre funcional pertenece al plan de verificación de la historia.
