# 1. Antes del framework: qué estamos construyendo

[Índice](README.md) · Siguiente: [patrones](02-patrones-y-decisiones.md)

Objetivo: que puedas explicar registro, login y acceso protegido sin utilizar las palabras controller, bean o decorator.

## 1.1 Cinco conceptos que suelen mezclarse

| Concepto | Pregunta que responde | Ejemplo StayHub |
|---|---|---|
| Identidad | ¿A qué cuenta nos referimos? | Un userId estable |
| Autenticación | ¿Qué evidencia demuestra esa identidad? | Contraseña comprobada o acceso federado |
| Sesión | ¿Sigue vigente esa autenticación? | Session sin revocación y antes de su límite |
| Autorización | ¿Puede esa identidad hacer esta acción? | OWNER puede iniciar cierta operación |
| Ownership | ¿Es este recurso suyo? | El perfil solicitado pertenece al sub autenticado |

Una administradora puede estar autenticada y aun así no tener permiso para editar otro perfil: la feature de StayHub no incluye administración de cuentas ajenas. “ADMIN” no significa saltarse toda regla.

Ejercicio: inventa un caso 401 y uno 403 para la misma URL. Explica qué sabe el servidor en cada caso.

## 1.2 Registro y login tienen resultados distintos

Registrar construye una cuenta completa. Iniciar sesión verifica una cuenta y crea una sesión. No es obligatorio que registrar también inicie sesión; StayHub los separa.

En un solo proceso:

1. Validas los datos.
2. Normalizas el correo según una regla explícita.
3. Calculas el hash de la contraseña.
4. Guardas identidad y credencial en una transacción.
5. Confirmas el registro.

En StayHub, identidad y credencial pertenecen a bases distintas. El paso 4 deja de ser una única transacción. Esa diferencia explica buena parte de la saga que estudiarás después.

El correo sirve para encontrar la cuenta; el userId sigue identificándola cuando el correo cambia. No copies el correo a todos los tokens y servicios como si fuera una clave inmutable.

## 1.3 Invariantes: las reglas que no puedes romper

Un invariante es una afirmación que debe seguir siendo cierta después de cada operación confirmada.

Escribe estas reglas antes del código:

- No hay dos cuentas con el mismo correo normalizado.
- Una cuenta incompleta no puede iniciar sesión.
- Una sesión conserva el rol que recibió al iniciarse en esta feature.
- Una sesión tiene como máximo un refresh activo después de cada rotación confirmada.
- Reutilizar un refresh consumido revoca la sesión asociada.
- Ninguna actualización de perfil modifica el rol.

La forma de comprobarlas importa. Hacer un SELECT y después un INSERT no garantiza unicidad bajo concurrencia. Una restricción UNIQUE sí arbitra solicitudes simultáneas en la base que posee esos datos.

No necesitas una clase para cada regla. Algunas viven mejor en el dominio; otras también necesitan una restricción SQL.

## 1.4 Contraseñas: comparar evidencia, no recuperarla

Para comprobar una contraseña, conservas un hash adaptativo con su configuración y salt, no la contraseña original. Argon2id es una opción recomendada por OWASP; su coste se calibra en el entorno real. Un hash rápido de propósito general, como SHA-256 usado solo, no cumple el mismo trabajo. El salt evita que contraseñas iguales produzcan siempre la misma representación; un secreto adicional del servidor, si se usa, tiene otro papel y otra operación de rotación. [Referencia OWASP](https://cheatsheetseries.owasp.org/cheatsheets/Password_Storage_Cheat_Sheet.html).

En StayHub la contraseña se evalúa exactamente como fue recibida: 8–128 puntos de código, sin trim, lowercase ni normalización Unicode. Es una regla del proyecto, no una política universal para todos los productos.

Caso de aprendizaje:

- “ Password ” y “Password” deben verificarse de manera distinta.
- Una cuenta inexistente también debe realizar trabajo de hash comparable usando una credencial señuelo.
- Aunque la comprobación contra el señuelo resulte verdadera, la cuenta sigue sin existir: el login debe exigir explícitamente identidad y credencial activas.

El señuelo reduce diferencias evidentes de coste; no prueba que todos los tiempos de respuesta sean idénticos.

## 1.5 Una sesión no necesita ser un JWT

Una sesión opaca puede funcionar así:

1. Generas un identificador aleatorio difícil de adivinar.
2. Guardas su referencia y estado en el servidor.
3. Envías el identificador mediante una cookie.
4. En cada petición consultas si sigue autorizado.

No confundir “opaco” con “cifrado”: significa que el cliente no interpreta un conjunto público de claims.

Para una aplicación web pequeña, este diseño puede ser suficiente. Permite revocar en el servidor, pero requiere consultar un almacén compartido al tener varias réplicas.

Un ID de sesión es un secreto bearer: quien lo posee puede intentar usarlo. Cookies Secure y HttpOnly, regeneración del identificador al autenticar y caducidad explícita son controles relevantes. [Gestión de sesiones de OWASP](https://cheatsheetseries.owasp.org/cheatsheets/Session_Management_Cheat_Sheet.html).

## 1.6 Qué aporta un JWT y qué no

Un JWT firmado transporta afirmaciones verificables. En un JWS habitual, el contenido está codificado, no oculto: no metas secretos esperando que la firma los cifre.

Para StayHub:

| Claim | Significado | Comprobación |
|---|---|---|
| sub | Usuario | Identificador estable |
| sid | Sesión de ese usuario | Existencia, usuario asociado, vigencia |
| role | Rol capturado al login | Allowlist y concordancia con la sesión |
| jti | Identificador de ese access token | Nuevo en cada emisión |
| iss | Emisor | Coincide exactamente con la configuración |
| aud | Receptor previsto | Incluye la API esperada |
| iat / exp | Emisión / vencimiento | Tiempo válido y política del proyecto |
| kid, en header | Clave utilizada | Pertenece al conjunto de claves permitido |

Leer el payload no es verificarlo. La biblioteca debe comprobar firma, algoritmo permitido y claims, además de tus reglas de dominio.

La firma responde “un emisor confiable produjo estos datos”; no responde por sí sola “esta sesión no fue revocada hace un segundo”.

Para una API que valida únicamente firma y expiración, un token ya emitido puede seguir funcionando después de un logout hasta vencer. Para exigir revocación inmediata necesitas una comprobación de estado o una estrategia equivalente.

## 1.7 Access token, refresh token e ID token

- **Access token:** lo presenta el cliente a la API para acceder a recursos.
- **Refresh token:** se presenta al servicio emisor para obtener nuevos tokens; no se usa como credencial de cada API.
- **ID token:** en OpenID Connect informa al cliente sobre la autenticación del usuario. No es el sustituto del access token de tu API.

OIDC añade una capa de identidad a OAuth 2.0. OAuth se ocupa de autorización delegada; un endpoint propio que verifica password y devuelve un JWT no se convierte por ello en un servidor OAuth/OIDC. [OpenID Connect Core](https://openid.net/specs/openid-connect-core-1_0.html).

En StayHub el refresh es opaco y de un solo uso. Guardas un HMAC/hash del token de alta entropía. Esta situación difiere de una contraseña elegida por una persona: no reutilices la justificación de hashes rápidos para passwords.

Ejercicio: explica dónde enviarías cada token y quién debería poder leerlo.

## 1.8 La línea temporal de StayHub

Supón un login a las 10:00 del lunes:

- El access inicial vence a las 11:00.
- La sesión tiene un límite absoluto de siete días.
- Renovar el martes emite un access de una hora y otro refresh.
- El nuevo refresh no añade otros siete días: mantiene el límite del login original.
- Renovar pocos minutos antes del límite no mantiene viva la sesión más allá de ese límite, aunque el access firmado tenga exp posterior.

Ese último caso obliga a comprobar también la sesión. Si solo miras exp, incumples el vencimiento absoluto definido por el proyecto.

Otras aplicaciones usan expiración deslizante o límites distintos. Aquí debes poder distinguir requisito del producto de preferencia personal.

## 1.9 Usuario y servicio son identidades diferentes

La llamada Gateway → Auth lleva una credencial del Gateway. La sesión del usuario es otro contexto.

No aceptes “x-user-id: tal” como evidencia por estar dentro de Docker. Define qué emisor, audiencia y permisos necesita cada llamador.

En el contrato actual de StayHub:

- Authorization de las rutas internas de Auth transporta service JWT.
- La validación interna recibe sessionId y userId que el Gateway obtuvo de un JWT de usuario ya validado.
- La respuesta interna de login contiene refresh en JSON.
- La cookie pública la maneja el Gateway.

Separar estas capas evita intentar meter dos bearer diferentes en el mismo header o aceptar roles enviados por el navegador.

## 1.10 Cookie, CORS, CSRF y XSS

Son problemas distintos:

- HttpOnly dificulta que JavaScript lea una cookie; no impide que el navegador la envíe.
- CSRF aprovecha credenciales que el navegador adjunta automáticamente a una petición.
- CORS controla qué respuestas puede leer código de otros orígenes; no es una autorización de negocio ni una solución general a CSRF.
- XSS ejecuta código dentro de tu origen. Guardar tokens en memoria reduce persistencia, pero no inmuniza a la aplicación frente a XSS.

Para cookies de sesión/refresh, diseña SameSite, comprobación de origen y protección CSRF según el flujo. No desactives CSRF porque “mi backend es stateless”: también hay credenciales automáticas en aplicaciones sin sesión de servidor. [OWASP CSRF](https://cheatsheetseries.owasp.org/cheatsheets/Cross-Site_Request_Forgery_Prevention_Cheat_Sheet.html), [Spring: CSRF y aplicaciones stateless](https://docs.spring.io/spring-security/reference/features/exploits/csrf.html).

## 1.11 Qué significa “distribuido”

No significa únicamente “tengo varias carpetas”:

1. Los procesos pueden caer por separado.
2. Un mensaje puede llegar aunque se pierda la respuesta.
3. El orden de ejecución puede cambiar.
4. Los relojes y las réplicas pueden discrepar.
5. Una transacción local no cubre automáticamente otra base o un servidor HTTP.

Un timeout representa incertidumbre: no demuestra que la otra parte no hizo nada. Este principio te acompañará durante toda la saga.

Antes de continuar, explica con un ejemplo la diferencia entre error confirmado y resultado desconocido.
