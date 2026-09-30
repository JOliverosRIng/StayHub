# Construir y comprender Auth con Spring

[Índice general](../README.md) · [Equivalente NestJS](../nest/README.md)

Objetivo: implementar las mismas reglas del caso StayHub usando Java y Spring, entendiendo qué aporta el framework y qué necesita diseño explícito.

Esta es una implementación alternativa de laboratorio. El proyecto actual exige Nest; esta guía no propone reemplazarlo durante el sprint.

## 0. Elige conscientemente qué papel tendrá Spring

Hay tres experimentos diferentes:

| Papel | Qué construyes | Qué no viene resuelto automáticamente |
|---|---|---|
| Auth propio | Registro, credenciales, sesiones y refresh con reglas StayHub | Seguridad completa y operación |
| Resource Server | Una API que recibe access tokens de Keycloak u otro emisor | Login del navegador, perfil y ownership |
| OAuth2 Client / BFF | Un backend que inicia login OIDC y mantiene sesión web | Tu autorización de negocio y política de sesión |

Un Resource Server no es un Authorization Server. Spring Security ofrece piezas para proteger aplicaciones; Spring Authorization Server ofrece un framework para construir un servidor OAuth/OIDC. No equivale a instalar una plataforma completa de administración de identidad. [Overview de Spring Authorization Server](https://docs.spring.io/spring-authorization-server/reference/overview.html).

La ruta principal empieza por Auth propio para aprender. Después compara con el Resource Server.

## 1. Prepara el proyecto y las versiones

Los ejemplos usan APIs de Java 21, Spring Boot 3.5.x, Spring Framework 6.2 y Spring Security 6.5. Es una base didáctica explícita, no una afirmación de que sea la última familia publicada. No mezcles imports javax de tutoriales antiguos con jakarta de esta base.

En Spring Initializr genera Maven + Java y selecciona una versión disponible y compatible; si usas otra familia, conserva esa decisión y consulta su documentación, sin mezclar fragmentos de varias generaciones.

Dependencias por etapas:

1. Spring Web, Validation y Spring Boot Test.
2. JDBC, PostgreSQL Driver y Flyway.
3. Spring Security y su soporte de tests.
4. Resource Server para verificar JWT y, si emites JWT, soporte JOSE apropiado.
5. Spring Data Redis solo cuando implementes límites.
6. OAuth2 Client únicamente para el experimento BFF/OIDC.

JDBC es una elección pedagógica inicial para ver el SQL y sus locks. Después puedes construir el mismo adaptador con JPA y comparar el momento de flush.

Usa el BOM/parent de Boot para alinear dependencias que administra. Agregar versiones sueltas de Security para “arreglar” una importación puede producir una combinación inconsistente.

Primer resultado: GET /health/live con una prueba. Luego una consulta simple a PostgreSQL; migraciones con Flyway, no generación automática destructiva del esquema.

## 2. Modela sin anotaciones

Ejemplo de concepto Java. Cada tipo público va en su propio archivo dentro de tu paquete:

```java
import java.time.Instant;
import java.util.UUID;

public record SessionView(
    UUID userId,
    Instant absoluteExpiresAt,
    Instant revokedAt
) {
    public boolean usableBy(UUID expectedUser, Instant now) {
        return userId.equals(expectedUser)
            && revokedAt == null
            && now.isBefore(absoluteExpiresAt);
    }
}
```

No hay @Entity, @Service ni HttpStatus. Es una regla que puedes probar con JUnit.

Prueba exactamente en el límite, un instante anterior, usuario distinto y revocación. Usa Clock.fixed de java.time para que el resultado no dependa del reloj del equipo.

Ahora define el puerto:

```java
public interface SessionReader {
    Optional<SessionView> findById(UUID sessionId);
}
```

Importa Optional y UUID. El caso de uso recibe SessionReader y Clock por constructor y lanza una excepción de aplicación si la sesión no se puede usar. Un fallo del adaptador DB se mantiene como dependencia no disponible.

**Puerta de avance:** prueba el caso de uso con un lambda/fake sin iniciar Spring.

## 3. Ensambla mediante beans

Ejemplo de composición, asumiendo que ya escribiste CheckSession:

```java
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

Importa Configuration/Bean desde Spring y Clock desde java.time. Registra tu SessionReader JDBC como otro bean.

Podrías anotar CheckSession con @Service, pero aquí se deja puro para practicar separación. Lo importante es la dirección de dependencias, no la ausencia de anotaciones como objetivo estético.

Si tienes dos SessionReader, usa @Qualifier o una selección explícita. No respondas a una ambigüedad de DI creando dependencias estáticas globales.

Equivalencias útiles:

| Necesidad | Nest | Spring |
|---|---|---|
| Ensamblaje | Module + providers | Configuration + Bean |
| Adaptador administrado | Injectable | Component / Repository / Bean |
| HTTP | Controller + decorators | RestController + mappings |
| Entrada | DTO + ValidationPipe | Record/DTO + Valid + Bean Validation |
| Error de aplicación | ExceptionFilter | RestControllerAdvice |
| Seguridad previa al controller | Guard / Passport | SecurityFilterChain |
| Transacción explícita | Prisma transaction client | TransactionTemplate / manager |
| Prueba HTTP | Supertest | MockMvc / cliente HTTP |

La equivalencia no es exacta: un guard de Nest y un filtro de Security tienen ciclos de ejecución e integración diferentes.

## 4. Define el contrato HTTP

Para registro local usa un record de request. Las anotaciones @NotBlank, @Email y @Size validan forma; las reglas de autorización no se delegan a esos validadores.

Hay dos detalles específicos del proyecto:

- El correo debe recortarse antes de aplicar el formato.
- Password se cuenta por puntos de código Unicode, no por unidades UTF-16.

En Java, String.length() no satisface necesariamente esa segunda condición. Para password utiliza un validador que evalúe:

```java
int characters = password.codePointCount(0, password.length());
```

No hagas strip/trim/normalización sobre password. Para nombre/correo usa una función canónica acordada y prueba Unicode/espacios para mantener paridad con TypeScript.

Configura Jackson para rechazar propiedades desconocidas en este laboratorio:

```yaml
spring:
  jackson:
    deserialization:
      fail-on-unknown-properties: true
```

Prueba que role/userId inyectados donde no pertenecen causan 400. No des por supuesto el comportamiento de tu ObjectMapper: podría haber personalizaciones.

Un @RestControllerAdvice traduce errores de aplicación a Problem Details. Incluye trazabilidad y campos seguros. Los errores que produce la cadena de Spring Security pueden ocurrir antes del controller: configúralos con AuthenticationEntryPoint y AccessDeniedHandler si necesitas el mismo formato para 401/403. Advice por sí solo no unifica toda la seguridad.

## 5. Contraseñas y registro local

PasswordEncoder ofrece encode y matches. Para reproducir la política Argon2id utiliza Argon2PasswordEncoder y la dependencia Bouncy Castle que necesita esa implementación. No asumas que el encoder delegado por defecto coincide con el algoritmo del proyecto. [Password storage](https://docs.spring.io/spring-security/reference/6.5/features/authentication/password-storage.html).

Ejemplo de parámetros de laboratorio, que debes medir antes de adoptar:

```java
@Bean
PasswordEncoder passwordEncoder() {
    // salt bytes, hash bytes, paralelismo, memoria KiB, iteraciones
    return new Argon2PasswordEncoder(16, 32, 1, 65536, 3);
}
```

Imports: PasswordEncoder y Argon2PasswordEncoder de Spring Security. Añade org.bouncycastle:bcprov-jdk18on con versión compatible y fijada en tu build si no la administra tu BOM. Consulta la firma del constructor en la [API oficial](https://docs.spring.io/spring-security/site/docs/6.5.3/api/org/springframework/security/crypto/argon2/Argon2PasswordEncoder.html).

El hash se calcula antes de abrir una transacción DB costosa. Dentro de la transacción inserta identidad y credencial; una restricción UNIQUE decide la duplicación del correo.

No expongas la entidad JDBC/JPA directamente como JSON. Define la respuesta de registro con cuatro campos. Ese DTO es una frontera para no serializar passwordHash accidentalmente.

Ejercicios:

1. Password correcta/incorrecta y preservación de espacios.
2. Dos registros concurrentes con correo equivalente.
3. Fallo del segundo INSERT revierte el primero.
4. Respuesta y log no contienen el hash.

## 6. Entiende realmente @Transactional

La anotación expresa una frontera transaccional, pero su comportamiento depende de la configuración y del modo proxy. Una llamada de un método al otro dentro del mismo objeto no atraviesa automáticamente el proxy; self-invocation puede dejar sin efecto la anotación del método interno. [Spring Transactional](https://docs.spring.io/spring-framework/reference/data-access/transaction/declarative/annotations.html).

Además:

- La transacción usa el manager y los recursos configurados.
- Anotar un método que llama REST no incorpora al servidor remoto en el commit.
- Dos DataSource no pasan a ser una sola transacción por compartir un método.
- En la configuración tradicional, RuntimeException/Error provoca rollback; checked exceptions requieren política explícita. [Reglas de rollback](https://docs.spring.io/spring-framework/docs/6.2.x/javadoc-api/org/springframework/transaction/annotation/Transactional.html).

Para aprender el límite con claridad, empieza con TransactionTemplate:

```java
// Ejemplo de concepto: repositorios JDBC usan el mismo DataSource/manager.
return transactionTemplate.execute(status -> {
    sessions.insert(session);
    refreshTokens.insert(firstToken);
    return session.id();
});
```

Una Unit of Work puede envolver esa plantilla y ofrecer un puerto sin tipos Spring a la aplicación. Para un servicio sencillo, una frontera @Transactional bien localizada también es válida. No añadas ambas capas sin una necesidad concreta. [Transacciones programáticas](https://docs.spring.io/spring-framework/reference/6.2/data-access/transaction/programmatic.html).

**Ejercicio:** provoca una excepción de runtime después del primer INSERT. Después invoca el método anotado mediante self-invocation. Predice y comprueba cuándo hay rollback.

## 7. Implementa login sin confundir Security con negocio

Spring tiene AuthenticationManager, AuthenticationProvider y PasswordEncoder. Puedes integrar una política propia en un provider o coordinar el caso de uso explícito. Decide un único dueño de la comprobación; no verifiques la contraseña dos veces por accidente.

Para el laboratorio StayHub, usa LoginUseCase puro:

1. Consulta rate limiter.
2. Resuelve identidad activa.
3. Recupera hash activo o usa señuelo.
4. Ejecuta matches incluso para identidad inexistente.
5. Exige identidad/credencial activas además del resultado de matches.
6. Persiste sesión y primer refresh de manera atómica.
7. Devuelve el par de tokens después del commit.

No ejecutes Users REST mientras mantienes bloqueada una fila de login.

Un éxito de autenticación en SecurityContext no crea por sí solo la Session de dominio con siete días, ni guarda tu refresh. Son niveles distintos.

## 8. Refresh concurrente con JDBC; después JPA

Usa PostgreSQL real. Lee el laboratorio compartido antes del código Java.

Secuencia dentro de una transacción:

1. Localiza la sesión a partir del hash y vuelve a leer bajo locks.
2. Bloquea Session antes de RefreshToken en todas las rutas.
3. Decide sobre estado y vencimiento.
4. Si se reutilizó: revoca sesión y descendientes, y confirma.
5. Si está activo: consume anterior, inserta sucesor, enlaza e incrementa versión.

Ejemplo de concepto del punto crítico:

```java
RotationDecision decision = transactionTemplate.execute(status -> {
    // Releer y bloquear; tipos/métodos son del laboratorio.
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

El fragmento representa el orden, no incluye generación de tokens ni el resultado completo. La versión final debe devolver un resultado tipado con el par preparado y nunca responder antes de commit.

No lances una excepción con rollback dentro de la transacción después de revocar: podrías responder 401 y conservar la sesión activa.

### Si lo haces con JPA

Aprende estas diferencias con una prueba:

- @Version ayuda a detectar escrituras obsoletas, pero no sustituye todo bloqueo de la rotación.
- Un lock pesimista solo tiene sentido dentro de la transacción que mantiene ese lock.
- El orden de tus llamadas save no siempre equivale al orden SQL de flush.
- Un índice parcial de un ACTIVE y una FK inmediata pueden fallar si Hibernate inserta el sucesor antes de consumir el anterior.

Puedes resolver el orden con flush explícito y consultas adecuadas, o usar JDBC para esta sección crítica. No desactives la restricción para hacer pasar una implementación desordenada.

**Puerta de avance:** dos conexiones compiten; como máximo una rotación gana y la detección del replay revoca su familia. Observa el estado DB desde una nueva transacción después del error.

## 9. JWT propio: emisión y verificación

Para emitir con la pila Spring puedes usar JwtEncoder/NimbusJwtEncoder y una fuente de claves privada configurada. Para recibir, JwtDecoder valida y produce claims.

Mantén dos responsabilidades:

- **Criptografía:** firma, algoritmo, clave, issuer/audience/tiempo.
- **Aplicación:** sid activa, userId asociado y role de la sesión.

No pongas consultas DB dentro de cada validador criptográfico por comodidad; define un paso claro de validación de sesión después de comprobar el token.

Prueba keys distintas para usuario y servicio. Un token de llamada Gateway→Auth no debe ser aceptado como identidad del huésped.

El contrato de usuario interno y el del servicio pueden requerir SecurityFilterChain distintas con matchers y orden explícitos. Añade una cadena final denyAll para que rutas no previstas no queden abiertas.

## 10. Saga y workers en Spring

El algoritmo de registro distribuido es el mismo que en Nest. Cambiar de lenguaje no elimina la incertidumbre de una llamada HTTP.

- Cliente HTTP tipado implementa el puerto Users.
- Transacciones locales guardan checkpoints.
- registrationId y fingerprint arbitran reintentos.
- Reconciliador consulta el estado real.
- Claim con lease y SKIP LOCKED reparte trabajo.

Un método @Scheduled se ejecuta en cada instancia habilitada. No implica “un único worker global”. Prueba con dos contextos/procesos contra la misma DB.

Mantén la llamada externa fuera de la transacción local; verifica owner/lease al actualizar. Si una dependencia cayó durante cancelación, conserva COMPENSATING para reintentar.

Usa Clock inyectado para TTL/backoff. Para locks usa conexiones y transacciones reales, no solo mocks Mockito que devuelven siempre éxito.

## 11. Variante práctica: API protegida por Keycloak

Este ejercicio sustituye la emisión propia por un emisor externo. El API se convierte en Resource Server.

La configuración de issuer permite verificar el emisor y descubrir claves; configura también la audiencia prevista. Spring convierte scopes a authorities SCOPE_ por defecto; los roles específicos de tu producto requieren un mapeo deliberado. [Resource Server JWT](https://docs.spring.io/spring-security/reference/6.5/servlet/oauth2/resource-server/jwt.html).

Configuración de laboratorio con Keycloak local:

```yaml
spring:
  security:
    oauth2:
      resourceserver:
        jwt:
          issuer-uri: http://localhost:8180/realms/stayhub-lab
          audiences:
            - stayhub-api
```

La propiedad audiences es parte de la configuración de Boot; verifica que tu versión seleccionada la soporte. Si defines tu propio JwtDecoder, combina validación de issuer/tiempo con un validador de audience: reemplazar el bean puede cambiar qué autoconfiguración se aplica. [OAuth2 en Boot](https://docs.spring.io/spring-boot/reference/security/oauth2.html).

Ejemplo de cadena para **un laboratorio que solo admite bearer explícito en Authorization**, sin cookies de autenticación, HTTP Basic ni oauth2Login:

```java
@Bean
SecurityFilterChain apiSecurity(HttpSecurity http) throws Exception {
    return http
        .csrf(csrf -> csrf.disable()) // Solo esta API bearer, no un BFF con cookies
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

Imports: Bean, HttpSecurity, SecurityFilterChain, SessionCreationPolicy y Customizer de sus paquetes Spring. El ejemplo establece autenticación, no termina el mapeo de roles ni ownership.

**No copies csrf.disable a una aplicación con cookies.** Si el navegador adjunta automáticamente una credencial, revisa la protección CSRF aunque uses JWT.

### Roles de Keycloak

En el laboratorio usarás client roles de stayhub-api. El mapper debe:

1. Leer resource_access únicamente después de validar JWT.
2. Extraer el objeto stayhub-api y su lista roles.
3. Aceptar solo GUEST/OWNER/ADMIN según el contrato del experimento.
4. Crear authorities ROLE_GUEST, ROLE_OWNER o ROLE_ADMIN.
5. Conservar scopes si las reglas de la aplicación también los utilizan.

No convertir todos los roles de todos los clientes del token a permisos de StayHub. Un rol ADMIN de otra aplicación no te pertenece.

Para una acción de OWNER puedes usar hasRole("OWNER"), que busca ROLE_OWNER. Para ownership compara el userId local vinculado al issuer/sub, no el email.

Validar JWT así no garantiza revocación inmediata. Si quieres comprobar estado online, evalúa introspección: Spring dispone de soporte Resource Server con introspector, incluso cuando el emisor utiliza tokens que tienen forma JWT. Ese camino tiene una dependencia de red que debes probar. [Opaque token / introspection](https://docs.spring.io/spring-security/reference/6.5/servlet/oauth2/resource-server/opaque-token.html).

## 12. Variante web: BFF con oauth2Login

En otro laboratorio añade OAuth2 Client, registra un cliente confidencial en Keycloak y configura client-id, secret e issuer. Spring puede iniciar el login y procesar el callback OIDC mediante oauth2Login. [OAuth2 Login](https://docs.spring.io/spring-security/reference/6.5/servlet/oauth2/login/core.html).

En esa topología:

- El navegador recibe una cookie de sesión del BFF.
- Los tokens permanecen en el backend.
- El BFF llama a las APIs con access token.
- Logout debe contemplar sesión BFF y sesión del proveedor.
- CSRF permanece habilitado y debe integrarse con el frontend.

No configures simultáneamente STATELESS y una sesión de navegador sin entender qué almacena cada componente. Usa configuraciones/cadenas deliberadas por superficie.

El BFF reduce exposición de tokens al navegador; no elimina XSS, CSRF ni el coste de almacenar sesiones.

## 13. Pruebas: usa Spring donde aporte evidencia

1. **JUnit puro:** reglas y casos de uso con Clock fijo.
2. **MockMvc:** serialización, validación y autorización de rutas.
3. **PostgreSQL real:** constraints, rollback, locks, migraciones y orden de flush.
4. **Redis real:** scripts y vencimiento.
5. **Stub HTTP:** timeout y respuestas del contrato Users.
6. **Keycloak real de laboratorio:** issuer/audience/roles/firma e integración del flujo.

El helper jwt() de spring-security-test crea autenticación de prueba útil para autorización. No demuestra que tu JwtDecoder rechace una firma incorrecta; agrega solicitudes con tokens realmente firmados para verificar esa frontera. [Testing OAuth2](https://docs.spring.io/spring-security/reference/6.5/servlet/test/mockmvc/oauth2.html).

No uses H2 como evidencia final de índices parciales, PostgreSQL locks o SKIP LOCKED. Testcontainers es una forma posible de disponer del motor real; una instancia aislada también sirve.

Con Maven Wrapper, comandos básicos del laboratorio:

```sh
./mvnw test
./mvnw verify
```

verify solo ejecutará los niveles configurados en tu build. Comprueba los reportes y configura pruebas de integración explícitamente; el nombre del comando no garantiza cobertura por sí solo.

## 14. Tu examen práctico de Spring

Explica y demuestra:

- Qué cambia al llamar un método transaccional mediante proxy o self-invocation.
- Por qué RestControllerAdvice puede no producir el 401 de Security.
- Qué valida JwtDecoder y qué valida la sesión de dominio.
- Por qué dos aplicaciones con @Scheduled necesitan coordinación compartida.
- Cómo persistir revocación y devolver 401 sin hacer rollback de la revocación.
- Qué desaparece de tu código al convertirte en Resource Server.

Si puedes implementar estas respuestas con pruebas, ya estás trabajando con las ideas y no solo con anotaciones.
