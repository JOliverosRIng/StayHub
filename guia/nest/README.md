# Construir y comprender Auth con NestJS

[Índice general](../README.md) · [Equivalente Spring](../spring/README.md)

Objetivo: llegar desde una regla TypeScript pura hasta registro distribuido y refresh concurrente, pudiendo explicar qué parte hace Nest y qué parte sigue siendo responsabilidad tuya.

## 0. Prepara un laboratorio

Necesitas TypeScript con interfaces y async/await, HTTP, SQL básico, un runner de pruebas y PostgreSQL. Si una Promise aún te resulta confusa, practica primero qué ocurre cuando rechaza entre dos escrituras.

Trabaja en un proyecto separado. El repo usa Nest 10, Prisma 6 y jose 5. Los ejemplos se apoyan en esa familia de APIs; no mezcles una instalación de jose de otra major con imports CommonJS sin revisar compatibilidad.

El proyecto conserva una restricción histórica a Node 20. Para un laboratorio nuevo usa una línea LTS soportada y registra la combinación que pruebas; a fecha de consulta Node 24 y 22 figuran como LTS y Node 20 está fuera de soporte. Eso requiere una decisión de actualización separada si modificas StayHub. [Versiones Node](https://nodejs.org/en/about/previous-releases), [EOL](https://nodejs.org/en/about/eol).

En tu bitácora anota versiones de Node, Nest, Prisma, PostgreSQL, Redis y lockfile. No necesitas instalar Redis en el primer ejercicio.

### El primer resultado

Antes de autenticación, construye una ruta GET /health/live y una prueba HTTP que espere 200. Su finalidad es verificar arranque, routing y runner. No demuestra readiness de DB.

## 1. Aprende una regla sin Nest

Ejemplo de concepto TypeScript, independiente de decoradores:

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

Test de concepto con Jest:

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

Completa las importaciones entre tus archivos. Añade pruebas un milisegundo antes, usuario distinto y sesión revocada.

**Qué estás aprendiendo:** tiempo inyectable, función de dominio y caso límite. Una prueba así no necesita levantar servidor ni simular Prisma.

**Puerta de avance:** cambia la comparación a <= y demuestra que una prueba falla.

## 2. Convierte la regla en un caso de uso

La regla necesita una sesión; alguien debe cargarla.

Ejemplo de concepto:

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

Este fragmento usa los tipos del ejercicio anterior. En un test crea CheckSession con un objeto cuyo findById devuelve un dato fijo.

No captures todos los errores como SessionRejected. Si el repositorio pierde la conexión, el resultado debe distinguir indisponibilidad de sesión inválida.

Aquí aparecen el **puerto** SessionReader y el **caso de uso** CheckSession. No aparecen porque una carpeta lo exija, sino porque separan una regla de una lectura concreta.

## 3. Ensámblalo con Nest

Nest permite asociar un token de runtime a un provider y construir otro mediante factory. Exporta el token desde un módulo para que los módulos consumidores puedan resolverlo. Una interfaz TypeScript por sí sola no sirve como token. [Custom providers](https://docs.nestjs.com/fundamentals/custom-providers).

Ejemplo de composición; SessionSqlAdapter debe ser el adaptador que tú implementes:

```ts
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

Importa Module desde @nestjs/common, tus tipos y clases desde sus archivos. El caso de uso sigue siendo TypeScript puro; el módulo sabe cómo crearlo.

Comprueba:

- ¿El módulo consumidor importa SessionsModule?
- ¿El token se declara una sola vez y se importa la misma instancia de Symbol?
- ¿Usaste useExisting para reutilizar el adaptador en vez de crear dos?
- ¿Estás intentando inyectar una interfaz borrada en runtime?

Estudia [CoreModule real](../../apps/auth-service/src/modules/core/core.module.ts) y [ServiceAuthModule](../../apps/auth-service/src/modules/service-auth/service-auth.module.ts). Dibuja sus imports y exports antes de copiar su estructura.

## 4. Comprende el recorrido HTTP

Para este tipo de request, el orden relevante es:

```text
middleware → guards → interceptor de entrada → pipes
           → controlador → caso de uso
           → interceptor de salida
errores no manejados → filtros de excepción
```

Los guards se ejecutan antes que los pipes y antes de entrar en el interceptor. Por eso un traceId necesario incluso en rechazos tempranos se asigna en middleware. [Request lifecycle](https://docs.nestjs.com/faq/request-lifecycle).

Asigna una función a cada pieza:

| Pieza | Responsabilidad en este proyecto |
|---|---|
| Middleware | Correlación y contexto temprano |
| Guard | Autenticación / autorización de acceso |
| Pipe + DTO | Forma y límites de entrada |
| Controller | Convertir HTTP a comando y salida |
| Use case | Coordinar reglas y puertos |
| Exception filter | Traducir errores a Problem Details |
| Interceptor | Medición, instrumentación y salida |

ValidationPipe puede transformar DTO y rechazar propiedades fuera de la whitelist. Ese control no convierte automáticamente una respuesta HTTP remota de Users en datos confiables: también hay que validar esa frontera. [Validación Nest](https://docs.nestjs.com/techniques/validation).

**Ejercicio:** en una ruta solo de test, registra nombres de etapas en un array. Compara petición válida, bearer incorrecto y DTO inválido. Usa datos sintéticos, no tokens ni contraseñas.

## 5. Construye registro local antes de la saga

Para el primer laboratorio usa una tabla de identidad y otra de credencial en la misma base:

1. Define un DTO con name/email/password/role.
2. Recorta name y email; aplica la regla canónica de email.
3. Conserva password exacta; cuenta puntos de código.
4. Calcula Argon2id mediante una biblioteca.
5. Inserta identidad y credencial en una transacción local.
6. Devuelve solo id/name/email/role.

Define un índice UNIQUE sobre email normalizado. Haz dos registros simultáneos para comprobar que el índice es el árbitro final.

**Por qué el hash antes de abrir la transacción:** es trabajo costoso que no necesita sostener locks de DB. Si la unicidad falla después, se descarta el hash calculado.

**Qué no hacer:** guardar un DTO completo como JSON de auditoría, usar password en un log o permitir ADMIN porque el enum de la base lo contiene.

Pruebas mínimas:

- Registro válido GUEST/OWNER.
- Nombre/correo normalizados.
- Password con espacios preservados.
- Duplicado de correo con distinto case.
- Fallo al insertar credencial revierte identidad.
- Campo inesperado rechaza la petición completa.

Cuando puedas explicarlo, compara con las fronteras de [data-model.md](../../specs/001-fundamentos-identidad/data-model.md). Ese laboratorio no debe introducir acceso de Auth a users_db en StayHub.

## 6. Implementa login con sesión opaca

Primero verifica la secuencia:

```text
email normalizado
  → buscar identidad
  → buscar credencial activa
  → verificar hash real o señuelo
  → exigir ambos estados ACTIVE
  → crear sesión
  → entregar identificador opaco
```

Usa un error genérico para credenciales incorrectas. La falta de Users/DB sigue siendo indisponibilidad.

En el laboratorio de navegador, la cookie necesita política Secure/HttpOnly/SameSite y CSRF. Si todavía no montaste HTTPS y navegador, prueba temporalmente el transporte con un cliente HTTP local y deja claro que no has verificado seguridad de cookie.

**Puerta de avance:** cierra/revoca la sesión en DB y comprueba que una petición posterior es rechazada. Explica qué fila se consultó.

## 7. Añade access JWT sin inventar criptografía

El emisor firma; el consumidor valida. Puedes usar jose del proyecto para ambas tareas, con claves RSA de laboratorio y configuración explícita.

Separa:

- Datos de entrada a firma: sub/sid/role/jti.
- Configuración confiable: algoritmo, issuer, audience, kid y clave.
- Claims de tiempo producidos por tu reloj.
- Principal que sale de verificación completa.

No permitas que el request elija issuer, audience o algoritmo.

Un guard de concepto:

```ts
// Pseudocódigo: verifyJwt y checkSession son puertos ya implementados.
async function authenticate(request) {
  const raw = extractSingleBearer(request);
  const claims = await verifyJwt(raw); // firma + claims; rechazo 401
  const session = await checkSession(claims.sid, claims.sub); // DB puede dar 503
  if (session.role !== claims.role) throw sessionRejected();
  request.principal = {
    userId: claims.sub,
    sessionId: claims.sid,
    role: session.role,
  };
}
```

Luego un guard de roles decide si principal.role está permitido. Para perfil, el caso de uso/servicio propietario comprueba además que el recurso corresponde al usuario.

Passport puede aportar una estrategia y su integración con guards. No implementa automáticamente tu tabla Session, el replay ni tu autorización por ownership. El tutorial de autenticación de Nest muestra los componentes básicos; úsalo para aprender integración, no como especificación completa de StayHub. [Autenticación Nest](https://docs.nestjs.com/security/authentication).

Prueba firma manipulada, algoritmo inesperado, kid no permitido, issuer/audience erróneos, token vencido y sesión revocada con JWT aún vigente.

## 8. Refresh: una operación de datos antes que un endpoint

Lee primero el [laboratorio SQL](../03-laboratorio-transacciones-y-fallos.md).

En el repo ya puedes estudiar [SessionUnitOfWork](../../apps/auth-service/src/application/ports/session-unit-of-work.port.ts) y [su adaptador Prisma](../../apps/auth-service/src/infrastructure/persistence/prisma/session-unit-of-work.ts).

Concepto esencial: todas las escrituras de una rotación usan el mismo transaction client. Un repositorio creado con prisma raíz no entra mágicamente en la transacción de otro repositorio. Prisma proporciona transacciones interactivas y aconseja mantenerlas breves. [Transacciones Prisma](https://www.prisma.io/docs/orm/fundamentals/transactions).

Pseudocódigo aplicado al puerto del proyecto:

```ts
const outcome = await unitOfWork.execute(async (tx) => {
  const session = await tx.lockSession(candidate.sessionId);
  const token = await tx.lockRefresh(tokenHash);
  // Revalidar existencia, vínculo, estado y vencimiento bajo lock.

  if (isReplayOfActiveSession(session, token, now)) {
    session.revoke(now, 'REFRESH_REUSE');
    await tx.saveSession(session);
    await tx.revokeActiveForSession(session.id);
    return { kind: 'replay' };
  }

  // Validar ACTIVE; preparar reemplazo y JWT con los puertos.
  await tx.markConsumed(token.id, now);
  await tx.insertSuccessor(replacement);
  await tx.linkSuccessor(token.id, replacement.id);
  // Persistir también la nueva versión de Session.
  return { kind: 'rotated', response: preparedResponse };
});

// Ya ocurrió COMMIT.
if (outcome.kind === 'replay') throw refreshRejected();
return outcome.response;
```

En las entidades reales se accede a propiedades mediante snapshot; el fragmento simplifica ese detalle para destacar el orden. No lo pegues como implementación completa.

**El error difícil:** si lanzas la excepción 401 dentro del callback después de revocar, la transacción puede revertir la revocación. Hay que confirmar ese cambio y traducir el resultado a error fuera de la transacción.

**Otro error:** insertar sucesor antes de consumir el anterior viola el índice de un ACTIVE; enlazar antes de insertar puede violar la FK. Escribe el orden SQL antes del TypeScript.

## 9. Separa Users y Auth: ahora aparece la saga

Toma el registro local que ya entiendes. Mueve identidad a otro proceso con otra DB y reemplaza su repositorio por un cliente HTTP.

La llamada ahora puede terminar en:

- Respuesta que confirma el paso.
- Error que confirma que fue rechazado.
- Timeout cuyo resultado remoto desconoces.

Para la tercera situación necesitas registrationId estable, operación idempotente, checkpoints y consulta del estado remoto.

Construye en este orden:

1. Contrato HTTP y stub con fallos controlados.
2. Registration durable y estados permitidos.
3. Mismo request repetido con key/fingerprint.
4. Avance por pasos idempotentes.
5. Recuperación después de reiniciar Auth.
6. Reconciliador sin el request original.
7. Reclamo entre dos workers.

No mantengas una transacción Prisma abierta mientras esperas a Users. El servidor remoto no comparte ese rollback y la espera retiene recursos locales.

Una limitación importante de StayHub: Auth no guarda nombre, correo ni password cruda. Un worker no puede recrearlos después de perder el request. En los pasos sin información suficiente debe esperar un reintento del cliente o cancelar estados internos al vencer; “reconciliar” no significa inventar datos.

Consulta [RegistrationWorkPort](../../apps/auth-service/src/application/ports/registration-work.port.ts) y estudia qué protege el owner del lease. Luego ejecuta el experimento de trabajador antiguo del laboratorio.

## 10. Añade Redis solo con una política escrita

Implementa contador por HMAC del email normalizado, no por email visible.

En el diseño actual:

- Fallos 1–5 devuelven 401.
- El sexto devuelve 429 y Retry-After.
- Con el contador bloqueado, no se verifica password hasta recuperar ventana.
- Un éxito permitido limpia fallos.
- Redis indisponible para antiabuso produce 503.

Un cliente Redis compartido entre réplicas permite un límite conjunto. Un Map en memoria no lo hace.

**Ejercicio:** usa dos instancias de Auth contra el mismo Redis y alterna los fallos. El sexto debe contar ambos procesos.

No confundas Redis para rate limit con Redis para caché de sesión. Si falla el segundo puedes consultar DB; si falla el primero, el proyecto falla cerrado.

## 11. Pruebas por pregunta, no por carpeta

| Pregunta | Prueba apropiada |
|---|---|
| ¿Vence exactamente en el límite? | Unidad con reloj fijo |
| ¿El DTO rechaza campos extra? | HTTP con pipe real |
| ¿Service JWT incorrecto impide ejecutar? | Guard real y criptografía real |
| ¿Rollback revierte ambas tablas? | PostgreSQL real |
| ¿Dos refresh producen un único sucesor? | Dos conexiones y barrera |
| ¿El cliente llama bien a Users? | Stub HTTP contractual |
| ¿G2 realmente cumple? | Provider Users real |

Nest ofrece TestingModule y overrides de providers para aislar escenarios. Que uses un override no convierte una prueba en integración real con la dependencia reemplazada. [Testing Nest](https://docs.nestjs.com/fundamentals/testing).

Los tests HTTP deben aplicar la misma configuración global que main; estudia [configureAuthHttp](../../apps/auth-service/src/interfaces/http/configure-auth-http.ts). De lo contrario puedes aprobar un DTO que producción procesa de otra forma.

En este repo, antes de ejecutar comandos revisa scripts y [resultados actuales](../../agents/result/README.md). Algunas suites se encuentran intencionalmente en RED mientras faltan casos de uso.

```sh
npm run typecheck
npm run lint
npm run test:unit
npm run build
```

Integración necesita las variables del harness y un almacén de pruebas autorizado para limpieza. No la apuntes a tu DB de desarrollo por comodidad.

## 12. Variante: Nest como API protegida por Keycloak

En este experimento, Nest deja de verificar passwords y emitir sesiones propias. Recibe access tokens de un proveedor.

Algoritmo del adaptador:

1. Leer issuer y URL JWKS de configuración confiable/discovery del issuer permitido.
2. Construir createRemoteJWKSet una vez, no una vez por request.
3. Ejecutar jwtVerify con issuer, audience y allowlist de algoritmos.
4. Exigir sub e interpretar solo los roles de esta API.
5. Resolver el perfil local mediante el par issuer/sub.
6. Aplicar ownership de StayHub.

No uses una URL jku arbitraria enviada por el token para elegir dónde descargar claves. La rotación de claves no debe permitir elegir el emisor.

Este camino valida JWT localmente; no promete revocación online inmediata. El [capítulo de alternativas](../04-keycloak-y-alternativas.md) te hace comparar introspección y revocación antes de decidir.

## 13. Tu examen práctico de Nest

Sin mirar una solución:

1. Monta una regla de Session con reloj falso.
2. Conéctala mediante provider y módulo.
3. Expón un endpoint que distinga 401 de 503.
4. Haz fallar dos refresh simultáneos en una implementación ingenua.
5. Corrígela con una transacción y comprueba la revocación tras replay.
6. Explica qué funciones borrarías al delegar login a Keycloak.

Si necesitas ayuda, vuelve a la documentación de la pieza concreta. No rediseñes toda la arquitectura ante cada fallo de inyección.
