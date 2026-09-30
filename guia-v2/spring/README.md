# Recorrido Spring

[Índice general](../README.md) · [Alternativa NestJS](../nest/README.md)

Objetivo: recorrer las etapas 1–3 con Java, Spring Boot 4 y Spring Security 7, entendiendo qué aporta el framework y qué necesita diseño explícito. La etapa 4 (MFA, email, recuperación) se configura en Keycloak: [capítulo 7](../07-mfa-email-recuperacion.md).

> **Estado de verificación:** los fragmentos Java de este recorrido están etiquetados. **Ninguno se compiló** en esta revisión. Se migraron de Boot 3.5 / Security 6.5 a Boot 4.1 / Security 7.1 revisando la documentación actual. El constructor de `Argon2PasswordEncoder` se comprobó en el Javadoc actual; el resto de APIs se nombran según la documentación enlazada y debes confirmarlas al compilar.

## 0. Qué papel tendrá Spring

| Papel | Qué construyes | Qué no viene resuelto |
|---|---|---|
| Auth propio (etapas 1–2) | Registro, credenciales, sesiones y refresh | Tus reglas de sesión, replay y ownership |
| Resource Server (etapa 3) | Una API que acepta access tokens de Keycloak | Login del navegador, perfil local, ownership |
| OAuth2 Client / BFF (opcional) | Un backend que inicia el login OIDC | Autorización de negocio y política de sesión |

Un Resource Server no es un Authorization Server. Spring Authorization Server es un framework para *construir* un servidor OAuth/OIDC. [Overview](https://docs.spring.io/spring-authorization-server/reference/overview.html).

## 1. Proyecto y versiones

Versiones de referencia (detalle en el [capítulo 6](../06-fuentes-y-versiones.md)): **Java 21 o 25**, **Spring Boot 4.1.x**, que trae **Spring Framework 7.0.x** y **Spring Security 7.1.x**.

Genera el proyecto en [Spring Initializr](https://start.spring.io/) con Maven y Java, eligiendo Boot 4.1.x. **Deja que Initializr escriba los starters**: Boot 4 reorganizó la modularización y algunos nombres de starter cambiaron respecto a Boot 3; no copies nombres de artefactos de tutoriales antiguos. Usa el parent/BOM de Boot y no fijes a mano versiones de Framework ni de Security.

Si vienes de Boot 3.x, sigue la guía de migración oficial de Boot 4 antes de reutilizar código. Diferencias que afectan a esta guía:

- Boot 4 usa Jackson 3 por defecto (paquetes `tools.jackson...` en lugar de `com.fasterxml.jackson...` para el databind). **No verifiqué** si las propiedades `spring.jackson.*` que uses conservan el mismo nombre: compruébalo en la referencia de Boot 4.
- En Spring Security 7 la configuración se escribe con el DSL de lambdas (el estilo encadenado con `.and()` ya no existe). Los ejemplos de abajo ya usan lambdas.
- Nunca mezcles `javax.*` con `jakarta.*`.

Dependencias por etapa (selecciónalas en Initializr por nombre):

1. Spring Web, Validation.
2. JDBC, PostgreSQL Driver, Flyway.
3. Spring Security.
4. OAuth2 Resource Server (etapa 3).
5. OAuth2 Client solo para el experimento BFF.

JDBC es una elección pedagógica: ves el SQL y sus locks. Después puedes repetir con JPA y comparar el momento del flush.

Primer resultado: `GET /health/live` con un test; después una consulta simple a PostgreSQL con migraciones Flyway.

## 2. Modela sin anotaciones

**Ejemplo de concepto:**

```java
import java.time.Instant;
import java.util.UUID;

public record SessionView(UUID userId, Instant absoluteExpiresAt, Instant revokedAt) {
    public boolean usableBy(UUID expectedUser, Instant now) {
        return userId.equals(expectedUser)
            && revokedAt == null
            && now.isBefore(absoluteExpiresAt);
    }
}
```

```java
import java.util.Optional;
import java.util.UUID;

public interface SessionReader {
    Optional<SessionView> findById(UUID sessionId);
}
```

Prueba en el límite exacto, un instante antes, usuario distinto y revocación. Usa `Clock.fixed` para no depender del reloj del equipo.

**Puerta de avance:** prueba el caso de uso con un lambda/fake sin arrancar Spring.

## 3. Ensambla mediante beans

**Ejemplo de concepto:**

```java
import java.time.Clock;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

@Configuration
class AuthComposition {
    @Bean
    Clock authClock() {
        return Clock.systemUTC();
    }

    @Bean
    CheckSession checkSession(SessionReader sessions, Clock authClock) {
        return new CheckSession(sessions, authClock);
    }
}
```

Si hay dos SessionReader, usa `@Qualifier` o una selección explícita.

| Necesidad | Nest | Spring |
|---|---|---|
| Ensamblaje | Module + providers | Configuration + Bean |
| HTTP | Controller + decorators | RestController + mappings |
| Entrada | DTO + ValidationPipe | Record + `@Valid` + Bean Validation |
| Error de aplicación | ExceptionFilter | RestControllerAdvice |
| Seguridad previa al controller | Guard | SecurityFilterChain |
| Transacción explícita | `prisma.$transaction` | TransactionTemplate |
| Prueba HTTP | Supertest | MockMvc / cliente HTTP |

La equivalencia no es exacta: un guard de Nest y un filtro de Security se ejecutan en momentos distintos.

## 4. Contrato HTTP

Record de request con `@NotBlank`, `@Email`, `@Size`. Dos detalles:

- Recorta el correo antes de validar su formato.
- La contraseña se cuenta por puntos de código:

```java
int characters = password.codePointCount(0, password.length());
```

`String.length()` cuenta unidades UTF-16. No hagas trim ni normalización sobre la contraseña.

Rechaza propiedades desconocidas en el JSON de entrada. En Boot 3 se hacía con `spring.jackson.deserialization.fail-on-unknown-properties=true`; en Boot 4 comprueba el nombre de la propiedad en la referencia (Jackson 3). Escribe el test: role/userId inyectados donde no corresponden → 400.

`@RestControllerAdvice` traduce errores de aplicación. Los errores de Spring Security ocurren antes del controller: configura `AuthenticationEntryPoint` y `AccessDeniedHandler` si quieres el mismo formato para 401/403.

## 5. Etapa 1a — Contraseñas y registro

`PasswordEncoder` ofrece `encode` y `matches`. Para Argon2id usa `Argon2PasswordEncoder`, que necesita Bouncy Castle en el classpath. [Password storage](https://docs.spring.io/spring-security/reference/features/authentication/password-storage.html).

**Ejemplo de concepto** (constructor comprobado en el [Javadoc actual](https://docs.spring.io/spring-security/reference/api/java/org/springframework/security/crypto/argon2/Argon2PasswordEncoder.html): `saltLength, hashLength, parallelism, memory, iterations`):

```java
import org.springframework.context.annotation.Bean;
import org.springframework.security.crypto.argon2.Argon2PasswordEncoder;
import org.springframework.security.crypto.password.PasswordEncoder;

@Bean
PasswordEncoder passwordEncoder() {
    // salt 16 B, hash 32 B, paralelismo 1, memoria 65536 KiB (64 MiB), 3 iteraciones.
    // Parámetros de laboratorio: mide el tiempo en tu máquina y compáralos con OWASP.
    return new Argon2PasswordEncoder(16, 32, 1, 65536, 3);
}
```

Existe también `Argon2PasswordEncoder.defaultsForSpringSecurity_v5_8()` (16 B de salt, 32 B de hash, paralelismo 1, memoria `1 << 14`, 2 iteraciones). Añade `org.bouncycastle:bcprov-jdk18on`; si el BOM de Boot no lo gestiona, fija una versión concreta.

No asumas que el `PasswordEncoder` delegado por defecto usa Argon2.

El hash se calcula antes de abrir la transacción. Dentro, inserta identidad y credencial; la UNIQUE decide los duplicados.

No expongas la entidad como JSON: define una respuesta con cuatro campos.

**Tests:**

- Positivo: contraseña correcta; espacios preservados.
- Negativo: contraseña incorrecta.
- Negativo: dos registros concurrentes con correo equivalente → uno 201, otro 409.
- Negativo: fallo en el segundo INSERT → no queda identidad.
- Negativo: la respuesta y los logs no contienen el hash.

## 6. Entiende @Transactional

La anotación funciona a través de un proxy: una llamada interna del mismo objeto (self-invocation) no pasa por el proxy y puede quedar sin transacción. [Transacciones declarativas](https://docs.spring.io/spring-framework/reference/data-access/transaction/declarative/annotations.html).

- Anotar un método que llama a un servicio remoto no mete a ese servicio en el commit.
- Por defecto, RuntimeException y Error provocan rollback; las checked exceptions no, salvo que lo configures.

Para ver el límite con claridad, empieza con `TransactionTemplate`. [Transacciones programáticas](https://docs.spring.io/spring-framework/reference/data-access/transaction/programmatic.html).

**Ejemplo de concepto:**

```java
return transactionTemplate.execute(status -> {
    identities.insert(identity);
    credentials.insert(credential);
    return identity.id();
});
```

**Ejercicio:** provoca una RuntimeException tras el primer INSERT. Luego invoca el método anotado por self-invocation. Predice y comprueba cuándo hay rollback.

## 7. Etapa 1b — Login con sesión opaca

Spring tiene `AuthenticationManager` y `AuthenticationProvider`. Puedes usarlos o coordinar un caso de uso propio; elige **un** dueño de la verificación, no compruebes la contraseña dos veces.

LoginUseCase:

1. Consulta el rate limit.
2. Resuelve la identidad activa.
3. Recupera el hash activo o usa el señuelo.
4. Ejecuta `matches` también para identidad inexistente.
5. Exige identidad y credencial activas además del resultado de `matches`.
6. Crea la sesión (id aleatorio; guarda su hash) en una transacción.
7. Envía la cookie `HttpOnly; Secure; SameSite=Lax` después del commit.

Un éxito en `SecurityContext` no crea tu tabla session ni su límite de siete días.

Con cookies, **CSRF debe estar activo**. [Spring: CSRF](https://docs.spring.io/spring-security/reference/features/exploits/csrf.html).

**Tests negativos:** contraseña incorrecta → 401 sin fila de sesión; correo inexistente → mismo 401; sesión revocada → 401; base caída → 503; POST sin token CSRF → 403.

## 8. Etapa 2a — JWT propio

Emisión: `JwtEncoder` / `NimbusJwtEncoder` con una fuente de claves privada. Verificación: `JwtDecoder`.

Separa:

- **Criptografía:** firma, algoritmo, clave, issuer/audience/tiempo.
- **Aplicación:** sid activa, usuario asociado y rol de la sesión.

No metas consultas a la base dentro de los validadores criptográficos; valida la sesión en un paso posterior claro.

Añade una cadena final con `denyAll` para que las rutas no previstas no queden abiertas.

**Tests negativos:** firma alterada, `aud` de otra aplicación, token vencido, rol del token distinto al de la sesión, sesión revocada con JWT vigente.

## 9. Etapa 2b — Refresh concurrente con JDBC

PostgreSQL real. Lee el [laboratorio B](../03-laboratorio-transacciones-y-fallos.md#laboratorio-b-una-familia-de-refresh) antes.

1. Localiza la sesión a partir del hash y relee bajo lock.
2. Bloquea Session antes que RefreshToken en todas las rutas.
3. Decide según estado y vencimiento.
4. Replay: revoca sesión y tokens activos, **y confirma**.
5. Válido: consume el anterior, inserta sucesor, enlaza, incrementa versión.

**Pseudocódigo:**

```java
RotationDecision decision = transactionTemplate.execute(status -> {
    // SELECT ... FOR UPDATE sobre session y refresh_token.
    if (replayDetected()) {
        revokeSessionAndActiveTokens();
        return RotationDecision.REPLAY;
    }
    rotateAndPersist();
    return RotationDecision.ROTATED;
});

// El callback retornó y la transacción confirmó.
if (decision == RotationDecision.REPLAY) {
    throw new RefreshRejectedException();
}
```

No lances una excepción con rollback dentro de la transacción tras revocar: responderías 401 y la sesión seguiría activa.

### Con JPA

- `@Version` detecta escrituras obsoletas; no sustituye todo el bloqueo de la rotación.
- Un lock pesimista solo vale dentro de la transacción que lo mantiene.
- El orden de tus `save` no siempre es el orden SQL del flush: el índice de un ACTIVE y la FK pueden fallar si Hibernate inserta el sucesor antes de consumir el anterior. Resuélvelo con flush explícito o usa JDBC en esta sección.

**Puerta de avance:** dos conexiones compiten; como mucho una rotación gana y el replay revoca la familia. Observa el estado desde una transacción nueva.

## 10. Etapa 3 — API protegida por Keycloak

La API se convierte en Resource Server. [Resource Server JWT](https://docs.spring.io/spring-security/reference/servlet/oauth2/resource-server/jwt.html).

**Ejemplo de concepto** (`application.yml`; propiedades según la [referencia OAuth2 de Boot](https://docs.spring.io/spring-boot/reference/security/oauth2.html), compruébalas en tu versión):

```yaml
spring:
  security:
    oauth2:
      resourceserver:
        jwt:
          issuer-uri: http://localhost:8180/realms/authlab
          audiences:
            - authlab-api
```

Si defines tu propio `JwtDecoder`, combina los validadores de issuer/tiempo con uno de audience: reemplazar el bean cambia lo que configura Boot.

**Ejemplo de concepto** (solo bearer en Authorization; sin cookies, sin HTTP Basic, sin oauth2Login):

```java
import org.springframework.context.annotation.Bean;
import org.springframework.security.config.Customizer;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.config.http.SessionCreationPolicy;
import org.springframework.security.web.SecurityFilterChain;

@Bean
SecurityFilterChain apiSecurity(HttpSecurity http) throws Exception {
    return http
        .csrf(csrf -> csrf.disable()) // Solo porque esta API no usa cookies
        .sessionManagement(session -> session
            .sessionCreationPolicy(SessionCreationPolicy.STATELESS))
        .authorizeHttpRequests(auth -> auth
            .requestMatchers("/health/live").permitAll()
            .anyRequest().authenticated())
        .oauth2ResourceServer(resource -> resource
            .jwt(Customizer.withDefaults()))
        .build();
}
```

**No copies `csrf.disable()` a una aplicación con cookies.**

### Roles de Keycloak

Spring convierte los scopes en authorities `SCOPE_*` por defecto; tus roles necesitan un converter propio que:

1. Lea `resource_access` solo tras validar el JWT.
2. Tome `resource_access.authlab-api.roles`.
3. Acepte solo GUEST/OWNER/ADMIN.
4. Cree `ROLE_GUEST`, `ROLE_OWNER`, `ROLE_ADMIN`.

No conviertas los roles de todos los clientes del token: un ADMIN de otra aplicación no es tuyo. Para ownership compara el userId local vinculado a issuer+sub, no el email.

Validar JWT localmente no da revocación inmediata. Si la necesitas, estudia introspección: [Opaque token](https://docs.spring.io/spring-security/reference/servlet/oauth2/resource-server/opaque-token.html).

**Tests:** los negativos del [paso 5 del capítulo 4](../04-keycloak-y-alternativas.md#paso-5-tests-negativos-obligatorios).

### Variante BFF (opcional)

Con OAuth2 Client y `oauth2Login` registras un cliente confidencial en Keycloak y Spring procesa el callback. [OAuth2 Login](https://docs.spring.io/spring-security/reference/servlet/oauth2/login/core.html). El navegador recibe una cookie de sesión del BFF, los tokens se quedan en el servidor y **CSRF sigue activo**.

## 11. Pruebas

1. **JUnit puro:** reglas y casos de uso con `Clock` fijo.
2. **MockMvc:** serialización, validación y autorización de rutas.
3. **PostgreSQL real:** restricciones, rollback, locks, migraciones y orden del flush.
4. **Keycloak real de laboratorio:** issuer, audience, roles y firma.

El helper `jwt()` de spring-security-test crea una autenticación sintética útil para probar autorización, pero no demuestra que tu `JwtDecoder` rechace una firma incorrecta. Añade peticiones con tokens firmados de verdad. [Testing OAuth2](https://docs.spring.io/spring-security/reference/servlet/test/mockmvc/oauth2.html).

No uses H2 como evidencia de índices parciales o locks de PostgreSQL. Testcontainers o una instancia desechable sirven.

```sh
./mvnw test
./mvnw verify
```

`verify` solo ejecuta lo que configuraste en el build; revisa los informes.

## 12. Examen práctico

Explica y demuestra:

- Qué cambia al llamar un método transaccional por el proxy o por self-invocation.
- Por qué `@RestControllerAdvice` puede no producir el 401 de Security.
- Qué valida `JwtDecoder` y qué valida tu sesión.
- Cómo persistir la revocación y devolver 401 sin hacer rollback de la revocación.
- Qué desaparece de tu código al convertirte en Resource Server.
