# 7. MFA, verificación de email y recuperación de contraseña

[Índice](README.md) · Anterior: [Keycloak](04-keycloak-y-alternativas.md)

Objetivo: entender qué problema resuelve cada mecanismo, configurarlo en el realm `authlab` del [capítulo 4](04-keycloak-y-alternativas.md#45-laboratorio-keycloak-local) y comprobarlo con tests negativos. Capítulo corto a propósito: Keycloak ya implementa estos flujos, y construirlos tú mismo es donde más fácil es equivocarse.

> **Estado de verificación:** los nombres de menús, flujos y acciones de este capítulo se tomaron de la [Server Administration Guide de Keycloak 26.7.4](https://www.keycloak.org/docs/latest/server_admin/index.html) (consultada el 2026-09-28). No se probaron contra un servidor en esta revisión. Si la consola de tu versión muestra otro nombre, manda la consola; anota la diferencia.

## 7.1 Por qué cada pieza

| Mecanismo | Pregunta que responde | Qué no resuelve |
|---|---|---|
| TOTP | ¿Tiene el usuario el dispositivo que registró? | Phishing en tiempo real: el código se puede reenviar a un sitio falso |
| Passkey (WebAuthn) | ¿Tiene la clave privada ligada a **este** origen? | Un dispositivo desbloqueado y robado |
| Verificación de email | ¿Controla el usuario esa dirección? | Que la persona sea quien dice ser |
| Recuperación de contraseña | ¿Puede recuperar el acceso quien controla el email? | Que el buzón esté comprometido |
| Recovery codes | ¿Puede entrar si pierde el segundo factor? | Que guarde los códigos en un lugar seguro |

La diferencia clave entre TOTP y passkeys: el código TOTP es un secreto compartido que el usuario escribe, así que una página falsa puede pedírselo y reutilizarlo. Una passkey firma un desafío ligado al dominio (Relying Party ID); el navegador no la usará en otro dominio.

## 7.2 Diseño si lo construyeras tú (para entender qué hace Keycloak)

**Pseudocódigo**, no se implementa en la ruta principal:

```text
emitirTokenDeUnSoloUso(userId, propósito):         # propósito: VERIFY_EMAIL | RESET_PASSWORD
  raw   = 32 bytes aleatorios de un CSPRNG
  guardar(hash(raw), userId, propósito, expira = ahora + corto, usado = false)
  enviar enlace con raw por email                   # nunca guardar raw

consumirToken(raw, propósito):
  en una transacción:
    fila = buscar por hash(raw) y propósito FOR UPDATE
    si no existe, está usada o vencida → rechazar (mismo mensaje en todos los casos)
    marcar usada
    aplicar efecto (email_verified = true | cambiar hash de contraseña y revocar sesiones)
```

Reglas que se derivan:

- **Un solo uso y vida corta.** Un enlace reutilizable es una contraseña permanente enviada por email.
- **Guardar solo el hash** del token, igual que con el refresh.
- **No revelar si el correo existe.** "Si la cuenta existe, te enviamos un correo" en todos los casos.
- **Tras cambiar la contraseña, revocar las sesiones** abiertas (o decidir explícitamente que no).
- **Rate limit** por cuenta y por IP en "olvidé mi contraseña".
- **Cambiar el email** exige verificar el nuevo antes de usarlo para login o recuperación.

## 7.3 Laboratorio: SMTP de pruebas

Keycloak necesita SMTP para verificación y recuperación. Usa un servidor de correo de pruebas que atrape los mensajes sin enviarlos. Ejemplo con Mailpit en una red compartida:

```sh
docker network create authlab

docker run -d --rm --name authlab-mail --network authlab \
  -p 127.0.0.1:8025:8025 \
  docker.io/axllent/mailpit
```

> **No verificado:** imagen, puerto SMTP (1025) y puerto de la interfaz web (8025) según la documentación de Mailpit que conozco; compruébalo en su documentación antes de usarlo. Cualquier servidor SMTP de pruebas sirve.

Keycloak tiene que estar en la misma red para resolver `authlab-mail`. Vuelve a lanzar el contenedor del capítulo 4 añadiendo `--network authlab` (si no montaste un volumen, pierdes la configuración; exporta el realm antes o repítela).

En **Realm settings → Email**: Host `authlab-mail`, Port `1025`, From `no-reply@authlab.test`. Usa **Test connection** y revisa el correo en http://localhost:8025.

## 7.4 Verificación de email

Configuración ([docs](https://www.keycloak.org/docs/latest/server_admin/index.html#proc-verify-user-email_server_administration_guide)):

1. **Realm settings → Login → Verify email = ON.**
2. Opcional: **Realm settings → Login → User registration = ON** para probar el autorregistro.
3. La vida del enlace se configura en **Realm settings → Tokens** (entrada "Email Verification").

Según la guía, con registro y "Verify email" activos, el formulario de registro no pide contraseña: el usuario verifica primero el correo y define la contraseña después.

En la API: el access token trae `email_verified`. Si una acción de tu negocio exige email verificado, compruébalo tú; que Keycloak lo verifique no obliga a tu API a mirarlo.

**Tests:**

- Positivo: tras hacer clic en el enlace, un token nuevo trae `email_verified: true`.
- Negativo: usar el mismo enlace dos veces → la segunda vez se rechaza.
- Negativo: enlace vencido (baja el lifespan a 1 minuto para probar) → rechazado.
- Negativo: con `email_verified: false`, tu endpoint que lo exige devuelve 403.

## 7.5 Recuperación de contraseña

Configuración ([docs](https://www.keycloak.org/docs/latest/server_admin/index.html#enabling-forgot-password)):

1. **Realm settings → Login → Forgot password = ON.** Aparece el enlace en el login.
2. SMTP configurado (7.3).
3. **Authentication → Required actions → Update Password** habilitada.
4. Vida del enlace: **Realm settings → Tokens** (entrada "Forgot password").

Comportamiento que documenta la guía:

- El flujo **Reset Credentials** pide actualizar la contraseña y, si el usuario tenía OTP, reconfigurarlo. Puedes desactivar esa parte poniendo el sub-flujo `Reset - Conditional OTP` en Disabled.
- La opción **Force login after reset** (engranaje de "Send Reset Email") acepta `true`, `false` y `only-federated` (valor por defecto). Para el laboratorio usa `true` y observa la diferencia.

**Tests:**

- Negativo: pedir reset para un correo inexistente → el mensaje en pantalla es el mismo que para uno existente.
- Negativo: reutilizar el enlace de reset → rechazado.
- Negativo: después del reset, la contraseña vieja no funciona.
- Medición: un access token emitido **antes** del reset, ¿lo sigue aceptando tu API? (Con validación JWT local, sí, hasta exp. Anótalo.)

## 7.6 TOTP

Configuración ([docs: OTP policies](https://www.keycloak.org/docs/latest/server_admin/index.html#one-time-password-otp-policies)):

1. **Authentication → Policies → OTP Policy.** Por defecto: TOTP, SHA1, ventana de 30 s, look-around 1. Deja "Reusable code" desactivado (así viene por defecto).
2. El flujo **browser** incluye el sub-flujo condicional **Browser - Conditional 2FA** con **OTP Form**: solo pide OTP a usuarios que ya lo configuraron.
3. Para **exigir** OTP a todos: habilita **Configure OTP** como required action por defecto (**Authentication → Required actions → Configure OTP → Default action = ON**), o duplica el flujo browser y usa el ejemplo "Conditional 2FA sub-flow with OTP default" de la guía.

Un usuario configura OTP desde la Account Console: http://localhost:8180/realms/authlab/account → Account security → Signing in.

Activa también la protección contra fuerza bruta: **Realm settings → Security defenses → Brute force detection** (viene desactivada). Según la guía, se aplica a contraseña, OTP y recovery codes.

**Tests:**

- Negativo: contraseña correcta + código TOTP incorrecto → no hay sesión.
- Negativo: reutilizar el mismo código válido en un segundo login dentro de la ventana → rechazado (porque "Reusable code" está en OFF).
- Negativo: con brute force detection activa, N fallos seguidos bloquean temporalmente; el mensaje de error es el mismo que para una contraseña incorrecta.

## 7.7 Passkeys

Configuración ([docs: Passkeys](https://www.keycloak.org/docs/latest/server_admin/index.html#passkeys_server_administration_guide)):

1. **Authentication → Required actions → WebAuthn Register Passwordless** habilitada.
2. **Authentication → Policies → WebAuthn Passwordless Policy:** la configuración por defecto suele bastar. Si el Relying Party ID queda vacío, Keycloak usa el host de su URL base (aquí, `localhost`).
3. **Realm settings → Login → Enable Passkeys = ON.** Aparece la opción **Passkey Mediation**; el valor por defecto `conditional` ofrece las passkeys en el autocompletado del campo de usuario.

Según la guía, con passkeys activas el sub-flujo **Browser - Conditional 2FA** se salta cuando el usuario entró con passkey (lo controla la condición **Condition - credential**). Si quieres 2FA incluso tras una passkey, pon esa condición en Disabled.

Registra una passkey desde la Account Console (Signing in → Set up a Passkey) o asignando la required action al usuario.

WebAuthn exige un contexto seguro. Los navegadores tratan `http://localhost` como seguro, así que el laboratorio local funciona sin HTTPS; con cualquier otro host necesitas HTTPS. Comprueba el soporte de tu navegador y sistema en [passkeys.dev](https://passkeys.dev/device-support/).

Añade **Recovery codes** como respaldo: habilita la required action **Recovery Authentication Codes** y pon **Recovery Authentication Code Form** en Alternative dentro de **Browser - Conditional 2FA**.

**Tests:**

- Positivo: login con passkey sin escribir contraseña.
- Negativo: borra la passkey desde la consola de administración → el login con passkey ya no funciona.
- Negativo: usar el mismo recovery code dos veces → la segunda se rechaza.
- Observación: accede a Keycloak con `127.0.0.1` en lugar de `localhost` después de registrar la passkey con `localhost`. ¿Qué pasa y por qué? (Pista: RP ID.)

## 7.8 Cómo sabe tu API que hubo MFA

Que Keycloak pidiera un segundo factor no llega solo a tu API. Si una acción sensible lo exige:

- El claim `acr` del token indica el nivel de autenticación. La guía recomienda que el cliente compruebe `acr` en vez de dar por hecho que se ejecutó una acción, porque el usuario puede manipular parámetros como `kc_action` o `acr_values` en la URL.
- Keycloak puede rellenar `amr` con el mapper **Authentication Method Reference (AMR)** si configuras valores de referencia en los autenticadores del flujo.
- Para exigir un nivel mínimo en el servidor existe la configuración **Minimum ACR Value** del cliente y el step-up por niveles (LoA) del flujo.

**Ejercicio:** configura dos niveles (contraseña = 1, contraseña + OTP = 2), protege un endpoint de tu API que exija `acr` ≥ 2 y demuestra con un token de nivel 1 que responde 403.

## 7.9 Autoevaluación

- ¿Por qué un TOTP no protege contra una página de phishing que actúa en tiempo real y una passkey sí?
- ¿Qué pasa con los access tokens ya emitidos cuando un usuario cambia su contraseña? ¿Qué tendrías que añadir para cortarlos al instante?
- ¿Por qué "si la cuenta existe, te enviamos un correo" es mejor que "cuenta no encontrada"?
- ¿Qué impide que un enlace de recuperación robado del buzón se use dentro de una semana?
