# AUTH-064 — Implementar rate limiter y Retry-After

Estado inicial: pendiente. Tipo: Implementación aplicación/Redis.

## Resultado esperado y evidencia

Faltan inspect/TTL, secreto para email y cabecera; usar incremento existente sin lectura previa permitiría intentos ilimitados durante bloqueo.

## Preparación

Leer [reglas compartidas](../decisiones.md): D01, D02, D04–D06, D08–D10, y [auditoría](../auditoria.md). Ejecutar desde la raíz del repositorio.

Dependencias: [AUTH-056](../AUTH-056/plan.md), [PRE-004](../PRE-004/plan.md).

## Archivos concretos

- `apps/auth-service/src/application/login/login-rate-limiter.ts`
- `apps/auth-service/src/application/ports/cache.port.ts`
- `apps/auth-service/src/infrastructure/cache/auth-cache.adapter.ts`
- `apps/auth-service/src/infrastructure/config/auth-config.ts`
- `apps/auth-service/src/interfaces/http/problem.filter.ts`
- `apps/auth-service/test/integration/login-rate-limit.spec.ts`
- `.env.example`

## Pasos de ejecución

1. Añadir loginIdentifierHmacSecret a config y AUTH_LOGIN_IDENTIFIER_HMAC_SECRET a env ejemplo; mínimo32 sin valor productivo. Mantener separado de refresh/fingerprint.
2. Extender cache con readLoginFailures(hash):{count,ttlSeconds} y recordLoginFailure(hash,900):{count,ttlSeconds}; preservar callers existentes o migrarlos. Implementar Lua para INCR+primer EXPIRE+TTL atómicos, y lectura/TTL coherente.
3. LoginRateLimiter convierte email normalizado a HMAC-SHA256 y aplica D05: inspect bloquea count>=6, recordFailure lanza 429 al sexto, clear elimina en éxito. Ningún error Redis se ignora.
4. No extender ventana por intentos bloqueados. Validar TTL faltante/inválido como fallo seguro o reparar de forma atómica documentada; nunca retryAfter negativo.
5. ProblemDetailsFilter detecta LoginRateLimitError y añade Retry-After en segundos enteros >=1 antes de enviar 429; cuerpo sigue siendo genérico.
6. Ejecutar AUTH-056 y unitarias de cálculo del HMAC/límites; probar que logs solo llevan código/count seguro, no correo/hash identificador.

## Criterios de aceptación

- [ ] Quinto fallo 401 y sexto 429, recuperación automática y limpieza en éxito.
- [ ] Todos los paths Redis fallan cerrado 503 cuando corresponde.
- [ ] Retry-After coincide con tiempo restante.

## Comprobación

```sh
npm run typecheck
npm run test --workspace @stayhub/auth-service -- --selectProjects integration --runTestsByPath test/integration/login-rate-limit.spec.ts
```

Mantener expiración absoluta, rol inmutable y límites de Auth. No implementar cookie Gateway ni acceso a users_db.

Al terminar, crear `agents/AUTH-064/resultado.md` con cambios, pruebas y bloqueos. No declarar como ejecutada una prueba pendiente de infraestructura. El estado del plan solo cambia cuando sus criterios se verifican.
