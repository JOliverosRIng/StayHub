# Recorrido NestJS

[Índice general](../README.md) · [Alternativa Spring](../spring/README.md)

Objetivo: recorrer las etapas 1–3 con TypeScript, Nest y Prisma, pudiendo explicar qué hace el framework y qué sigue siendo responsabilidad tuya. La etapa 4 (MFA, email, recuperación) se configura en Keycloak: [capítulo 7](../07-mfa-email-recuperacion.md).

> **Estado de verificación:** los fragmentos TypeScript de este recorrido están etiquetados. Ninguno se compiló en esta revisión. Las APIs de Nest, jose y Prisma que se nombran existen en la documentación oficial enlazada, pero comprueba firmas y opciones en la versión que instales.

## 0. Prepara el laboratorio

Necesitas TypeScript con async/await, HTTP, SQL básico y PostgreSQL. Trabaja en un proyecto **nuevo**, separado de cualquier repositorio real.

Versiones de referencia (detalle en el [capítulo 6](../06-fuentes-y-versiones.md)):

| Pieza | Versión | Nota |
|---|---|---|
| Node.js | 24 LTS | 20 ya es EOL; Nest 12 exige 20.19+ o 22.12+ |
| NestJS | 12.x | Paquetes ESM; `nest new` pregunta CommonJS o ESM. La línea 11.x sigue recibiendo parches |
| Prisma ORM | 7.x | 8 está en release candidate; no lo uses para aprender |
| jose | 6.x | Si vienes de jose 5, revisa su guía de migración |
| PostgreSQL | 16 | Base desechable, ver [capítulo 3](../03-laboratorio-transacciones-y-fallos.md) |

Si vienes de Nest 10 / Prisma 6: Nest 12 y Prisma 7 traen cambios de arranque y configuración. Sigue la [guía de migración de Nest](https://docs.nestjs.com/migration-guide) y la documentación de Prisma 7 en vez de copiar configuración antigua.

Con Nest 12, los proyectos ESM nuevos usan Vitest por defecto y los CommonJS siguen con Jest. Los tests de esta guía usan `describe/it/expect`, que existen en ambos; con Vitest importa esas funciones desde `vitest` si no activas los globals.

Anota en tu bitácora las versiones exactas y el lockfile.

### Primer resultado

Antes de autenticación, construye `GET /health/live` y un test HTTP que espere 200. Verifica arranque, routing y runner; no demuestra que la base esté disponible.

## 1. Una regla sin Nest

**Ejemplo de concepto** (TypeScript puro):

```ts
export interface Clock {
  now(): Date;
}

export interface SessionView {
  userId: string;
  absoluteExpiresAt: Date;
  revokedAt: Date | null;
}

export function canUseSession(
  session: SessionView,
  expectedUserId: string,
  clock: Clock,
): boolean {
  return (
    session.userId === expectedUserId &&
    session.revokedAt === null &&
    clock.now().getTime() < session.absoluteExpiresAt.getTime()
  );
}
```

Test:

```ts
it('rechaza exactamente en el vencimiento', () => {
  const instant = new Date('2026-10-05T10:00:00.000Z');
  const clock = { now: () => instant };
  expect(canUseSession({
    userId: 'user-a',
    revokedAt: null,
    absoluteExpiresAt: instant,
  }, 'user-a', clock)).toBe(false);
});
```

Añade: un milisegundo antes (true), usuario distinto (false), sesión revocada (false).

**Puerta de avance:** cambia `<` por `<=` y demuestra que un test falla.

## 2. Convierte la regla en un caso de uso

**Ejemplo de concepto:**

```ts
export interface SessionReader {
  findById(id: string): Promise<SessionView | null>;
}

export class SessionRejected extends Error {}

export class CheckSession {
  constructor(
    private readonly sessions: SessionReader,
    private readonly clock: Clock,
  ) {}

  async execute(id: string, userId: string): Promise<void> {
    const session = await this.sessions.findById(id);
    if (!session || !canUseSession(session, userId, this.clock)) {
      throw new SessionRejected();
    }
  }
}
```

No conviertas cualquier error en SessionRejected: si la base pierde la conexión, eso es 503, no 401.

## 3. Ensámblalo con Nest

Una interfaz TypeScript no existe en runtime; Nest necesita un token real. [Custom providers](https://docs.nestjs.com/fundamentals/custom-providers).

**Ejemplo de concepto** (`SessionSqlAdapter` es el adaptador que tú implementas):

```ts
import { Module } from '@nestjs/common';

export const SESSION_READER = Symbol('SESSION_READER');
export const CLOCK = Symbol('CLOCK');

@Module({
  providers: [
    { provide: CLOCK, useValue: { now: () => new Date() } },
    SessionSqlAdapter,
    { provide: SESSION_READER, useExisting: SessionSqlAdapter },
    {
      provide: CheckSession,
      inject: [SESSION_READER, CLOCK],
      useFactory: (reader: SessionReader, clock: Clock) =>
        new CheckSession(reader, clock),
    },
  ],
  exports: [CheckSession],
})
export class SessionsModule {}
```

Comprueba:

- ¿El módulo consumidor importa SessionsModule?
- ¿El Symbol se declara una sola vez y se importa la misma instancia?
- ¿useExisting reutiliza el adaptador en vez de crear dos?

## 4. El recorrido HTTP

```text
middleware → guards → interceptor (entrada) → pipes
           → controlador → caso de uso
           → interceptor (salida)
errores no manejados → filtros de excepción
```

Los guards se ejecutan antes que los pipes y los interceptores. [Request lifecycle](https://docs.nestjs.com/faq/request-lifecycle).

| Pieza | Responsabilidad |
|---|---|
| Middleware | Correlación y contexto temprano |
| Guard | Autenticación y autorización de acceso |
| Pipe + DTO | Forma y límites de entrada |
| Controller | Convertir HTTP a comando y respuesta |
| Caso de uso | Coordinar reglas y puertos |
| Exception filter | Traducir errores a respuestas (p. ej. Problem Details) |

`ValidationPipe` con `whitelist` y `forbidNonWhitelisted` rechaza propiedades no declaradas. [Validación Nest](https://docs.nestjs.com/techniques/validation). Nest 12 también acepta esquemas Standard Schema (Zod, Valibot…) en `@Body({ schema })`; elige un enfoque y mantenlo.

**Ejercicio:** en una ruta de test, registra en un array el nombre de cada etapa. Compara una petición válida, un bearer incorrecto y un DTO inválido.

## 5. Etapa 1a — Registro

Una tabla de identidad y otra de credencial **en la misma base**:

1. DTO con name/email/password/role.
2. Recorta name y email; aplica la regla canónica del email.
3. Conserva la contraseña exacta; cuenta puntos de código (`[...password].length`), no unidades UTF-16.
4. Calcula Argon2id con una biblioteca (por ejemplo, el paquete npm `argon2`; comprueba su API y versión). Calibra memoria/iteraciones en tu máquina siguiendo [OWASP](https://cheatsheetseries.owasp.org/cheatsheets/Password_Storage_Cheat_Sheet.html).
5. Inserta identidad y credencial en **una** transacción Prisma (`prisma.$transaction(async (tx) => { ... })`).
6. Devuelve solo id/name/email/role.

UNIQUE sobre email normalizado en la migración. El hash se calcula **antes** de abrir la transacción: es caro y no necesita locks. Si la unicidad falla, se descarta.

No permitas role=ADMIN desde el registro aunque el enum lo contenga.

**Tests:**

- Positivo: registro válido GUEST/OWNER → 201.
- Positivo: nombre/correo normalizados; contraseña con espacios preservada.
- Negativo: mismo correo con otro case → 409.
- Negativo: role=ADMIN → 400/403.
- Negativo: campo inesperado → 400.
- Negativo: fallo forzado al insertar la credencial → no queda identidad (compruébalo con otra conexión).
- Negativo: la respuesta y los logs no contienen el hash.

## 6. Etapa 1b — Login con sesión opaca

```text
email normalizado
  → buscar identidad
  → buscar credencial activa
  → verificar hash real, o el señuelo si no hay cuenta
  → exigir identidad y credencial ACTIVE
  → crear session (id aleatorio de 32 bytes; guarda su hash)
  → Set-Cookie
```

Cookie: `HttpOnly`, `Secure`, `SameSite=Lax` (o Strict), `Path=/`, caducidad explícita. Con Express puedes usar `res.cookie(...)`; Nest 12.1 incorpora soporte propio de cookies y CSRF, pero **no verifiqué su API**: consulta la documentación de tu versión antes de usarlo.

Para acciones que cambian estado con cookie, necesitas protección CSRF. [OWASP CSRF](https://cheatsheetseries.owasp.org/cheatsheets/Cross-Site_Request_Forgery_Prevention_Cheat_Sheet.html).

Un guard lee la cookie, busca `hash(sid)` en session y aplica `canUseSession`.

**Tests:**

- Negativo: contraseña incorrecta → 401 genérico y ninguna fila nueva en session.
- Negativo: correo inexistente → mismo 401, mismo cuerpo.
- Negativo: revoca la sesión en la base → la siguiente petición da 401.
- Negativo: cookie manipulada → 401.
- Negativo: la base caída → 503, no 401.

**Puerta de avance:** explica qué fila se consultó para decidir cada 401.

## 7. Etapa 1c — Autorización y ownership

Un guard de roles decide si `principal.role` está permitido. El caso de uso comprueba además que el recurso pertenece al usuario.

**Negativo:** dos OWNER; el primero edita el perfil del segundo → 403.

## 8. Etapa 2a — Access JWT

El emisor firma; el consumidor valida. Con jose:

**Ejemplo de concepto** (no compilado; comprueba las firmas en la documentación de jose 6):

```ts
import { SignJWT, jwtVerify } from 'jose';
import { randomUUID } from 'node:crypto';

const ISS = 'http://localhost:3000';
const AUD = 'authlab-api';

async function issueAccess(
  userId: string, sessionId: string, role: string,
  privateKey: CryptoKey, kid: string, nowSeconds: number,
) {
  return new SignJWT({ sid: sessionId, role })
    .setProtectedHeader({ alg: 'ES256', kid })
    .setSubject(userId)
    .setIssuer(ISS)
    .setAudience(AUD)
    .setJti(randomUUID())
    .setIssuedAt(nowSeconds)
    .setExpirationTime(nowSeconds + 3600)
    .sign(privateKey);
}

async function verifyAccess(token: string, publicKey: CryptoKey) {
  const { payload } = await jwtVerify(token, publicKey, {
    issuer: ISS,
    audience: AUD,
    algorithms: ['ES256'],
  });
  return payload; // luego: comprobar sid contra la tabla session
}
```

No dejes que la request elija issuer, audience ni algoritmo.

**Pseudocódigo** del guard:

```ts
async function authenticate(request) {
  const raw = extractSingleBearer(request);
  const claims = await verifyAccess(raw, publicKey);    // firma + claims → 401
  const session = await checkSession(claims.sid, claims.sub); // base caída → 503
  if (session.role !== claims.role) throw sessionRejected();
  request.principal = { userId: claims.sub, sessionId: claims.sid, role: session.role };
}
```

Passport puede integrarse con guards, pero no implementa tu tabla session, el replay ni el ownership. [Autenticación Nest](https://docs.nestjs.com/security/authentication).

**Tests negativos:** firma manipulada, `alg` inesperado, `kid` desconocido, issuer/audience erróneos, token vencido, sesión revocada con JWT aún vigente.

## 9. Etapa 2b — Refresh rotatorio con replay

Lee antes el [laboratorio B](../03-laboratorio-transacciones-y-fallos.md#laboratorio-b-una-familia-de-refresh).

Refresh: 32 bytes aleatorios (`randomBytes(32).toString('base64url')`), guardas `HMAC-SHA256(secreto, raw)`, lo envías en cookie HttpOnly con Path limitado a la ruta de refresh.

Todas las escrituras de una rotación usan el **mismo** transaction client. Prisma no expone `SELECT ... FOR UPDATE` en su API de consultas; usa `tx.$queryRaw` para los locks. [Transacciones Prisma](https://www.prisma.io/docs/orm/prisma-client/queries/transactions).

**Pseudocódigo:**

```ts
const outcome = await prisma.$transaction(async (tx) => {
  const session = await lockSession(tx, candidate.sessionId);   // $queryRaw ... FOR UPDATE
  const token = await lockRefresh(tx, tokenHash);               // $queryRaw ... FOR UPDATE
  // Revalidar existencia, vínculo, estado y vencimiento bajo lock.

  if (token.state === 'CONSUMED') {
    await revokeSession(tx, session.id, now);
    await revokeActiveTokens(tx, session.id);
    return { kind: 'replay' as const };
  }

  await markConsumed(tx, token.id, now);
  const successor = await insertSuccessor(tx, session.id);
  await linkSuccessor(tx, token.id, successor.id);
  await bumpSessionVersion(tx, session.id);
  return { kind: 'rotated' as const, response: prepared };
});

// Aquí ya hubo COMMIT.
if (outcome.kind === 'replay') throw new UnauthorizedException();
return outcome.response;
```

**El error difícil:** si lanzas el 401 dentro del callback después de revocar, Prisma hace rollback y la revocación se pierde.

**Otro error:** insertar el sucesor antes de consumir el anterior viola el índice de un ACTIVE; enlazar antes de insertar viola la FK.

**Tests (con PostgreSQL real, no mocks):**

- Positivo: rotación válida → par nuevo; el viejo queda CONSUMED.
- Negativo: reutilizar el viejo → 401 y sesión revocada; el nuevo tampoco sirve.
- Negativo: dos rotaciones simultáneas con el mismo token → como mucho una 200.
- Negativo: refresh tras el límite absoluto de 7 días → 401.

## 10. Pruebas por pregunta

| Pregunta | Prueba |
|---|---|
| ¿Vence exactamente en el límite? | Unitaria con reloj fijo |
| ¿El DTO rechaza campos extra? | HTTP con el pipe real |
| ¿El rollback revierte ambas tablas? | PostgreSQL real |
| ¿Dos refresh producen un solo sucesor? | Dos conexiones y barrera |
| ¿Firma incorrecta se rechaza? | Guard real con criptografía real |

Los tests HTTP deben aplicar la misma configuración global que `main.ts` (pipes, filtros, prefijos); extráela a una función compartida. TestingModule y overrides aíslan escenarios, pero un override no convierte la prueba en integración real. [Testing Nest](https://docs.nestjs.com/fundamentals/testing).

## 11. Etapa 3 — Nest como API protegida por Keycloak

Nest deja de verificar contraseñas y de emitir tokens. Recibe access tokens de Keycloak ([capítulo 4](../04-keycloak-y-alternativas.md)).

**Ejemplo de concepto:**

```ts
import { createRemoteJWKSet, jwtVerify } from 'jose';

const ISSUER = 'http://localhost:8180/realms/authlab';
// Se construye una vez, no por request.
const JWKS = createRemoteJWKSet(new URL(`${ISSUER}/protocol/openid-connect/certs`));

async function verifyKeycloakAccess(token: string) {
  const { payload } = await jwtVerify(token, JWKS, {
    issuer: ISSUER,
    audience: 'authlab-api',
    algorithms: ['RS256'],
  });
  const roles = (payload as any).resource_access?.['authlab-api']?.roles ?? [];
  return { sub: payload.sub!, roles: roles.filter((r: string) => ['GUEST', 'OWNER', 'ADMIN'].includes(r)) };
}
```

La URL de JWKS puede tomarse de `jwks_uri` en el discovery del issuer permitido. Nunca de un `jku` enviado en el token.

Después: resolver el perfil local por `(issuer, sub)` y aplicar ownership.

Esta variante valida localmente: un logout en Keycloak no invalida el access ya emitido hasta su exp.

**Tests:** los negativos del [paso 5 del capítulo 4](../04-keycloak-y-alternativas.md#paso-5-tests-negativos-obligatorios).

## 12. Examen práctico

Sin mirar una solución:

1. Regla de sesión con reloj falso.
2. Conéctala con provider y módulo.
3. Endpoint que distingue 401 de 503.
4. Haz fallar dos refresh simultáneos en una implementación ingenua.
5. Corrígela con una transacción y comprueba la revocación tras replay.
6. Explica qué borrarías al delegar el login a Keycloak.
