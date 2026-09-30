# 5. Ejercicios y criterios de dominio

[Índice](README.md) · Lee las pistas solo después de formular tu hipótesis.

La meta es que puedas repetir un razonamiento en una situación nueva. Puedes consultar documentación, mensajes de error, código fuente de librerías y tu depurador. Los ejercicios de saga, leases, reconciliación y Redis están en el [apéndice distribuido](apendice-distribuido.md#a7-ejercicios-distribuidos).

## 5.1 Bitácora breve

```text
Problema:
Entrada y salida:
Invariante:
Hipótesis:
Experimento:
Resultado observado:
Explicación:
Siguiente paso:
```

Cuando algo falle, reduce el ejemplo antes de añadir otra abstracción.

## 5.2 Ruta de entregables

| Etapa | Entregable que puedes mostrar | Qué todavía no prueba |
|---|---|---|
| 1a | Regla de sesión con reloj fijo y pruebas de límites | Persistencia ni seguridad HTTP |
| 1b | Registro/login con Argon2id, UNIQUE y sesión opaca en cookie | Tokens, rotación |
| 1c | Endpoint protegido con ownership | Revocación en otros componentes |
| 2 | JWT de acceso + refresh rotatorio probado con dos conexiones y replay | Delegación a un proveedor |
| 3 | API Nest o Spring consumiendo tokens de Keycloak | Equivalencia exacta con tus reglas propias |
| 4 | MFA, verificación de email y reset configurados y probados | Operación en producción |
| 5 | Comparación escrita de tu Auth propio frente a Keycloak | Capacidad operativa real |

Avanza cuando puedas demostrar el resultado, no cuando una carpeta tenga muchos archivos.

## 5.3 Ejercicios

Cada ejercicio tiene un **criterio de éxito** y al menos un **test negativo**.

### E1 — Identidad y correo

Una persona cambia su correo después de iniciar sesión. ¿Cuáles de estos datos deberían cambiar: userId, email normalizado, sub, role de Session, refresh vigente?

**Criterio:** un login nuevo usa el correo nuevo y una operación de perfil usa el identificador estable.
**Negativo:** el correo viejo ya no permite login.

### E2 — El límite exacto

Crea una sesión en un instante fijo y prueba un milisegundo antes, exactamente en el límite y un milisegundo después. Define unidades: JWT usa segundos; tus objetos pueden tener milisegundos.

**Criterio:** no hay sleep ni dependencia del reloj real.
**Negativo:** exactamente en el límite, la sesión se rechaza.

### E3 — Cuenta inexistente

Haz que el hasher señuelo devuelva true. ¿Tu caso de uso permite login? Escribe la prueba antes de corregirlo.

**Criterio:** se exige identidad y credencial activas, no solo coincidencia contra algún hash.
**Negativo:** login con correo inexistente + señuelo "true" → 401 y ninguna fila en session.

### E4 — Duplicados concurrentes

Dos clientes registran la misma cuenta simultáneamente. Reproduce el [laboratorio A y A2](03-laboratorio-transacciones-y-fallos.md#laboratorio-a-unicidad-ante-dos-registros) y luego la misma carrera por HTTP.

**Criterio:** explicas por qué una preconsulta no arbitra la carrera.
**Negativo:** con dos requests en paralelo, exactamente una recibe 201 y la otra 409.

### E5 — Dos transacciones por accidente

Inicia una transacción en el repositorio de identidad y, desde su callback, llama a un save del repositorio de credencial que usa una conexión independiente. Provoca un error al final.

**Criterio:** muestras qué escritura sobrevivió y lo corriges usando el mismo recurso transaccional.
**Negativo:** tras el fallo, no queda identidad sin credencial.

### E6 — El 401 engañoso

Detecta replay, revoca la sesión y lanza una excepción dentro del callback transaccional. Consulta el estado desde otra conexión.

**Criterio:** conservas la revocación y devuelves 401 sin desactivar el rollback para todos los errores.
**Negativo:** tras el replay, ningún refresh de esa sesión funciona.

### E7 — Token firmado pero incorrecto

Firma con una clave confiable un JWT con aud de otra aplicación. Luego otro con role ADMIN para una sesión GUEST.

**Criterio:** ambos se rechazan por razones distintas. Una firma válida no autoriza cualquier interpretación.

### E8 — Propietario de qué

Dos usuarios tienen OWNER. El primero intenta editar el perfil del segundo.

**Criterio:** sigue siendo denegado. El guard de roles y el control de ownership responden preguntas diferentes.

### E9 — Respuesta perdida en refresh

Reproduce el [laboratorio C](03-laboratorio-transacciones-y-fallos.md#laboratorio-c-respuesta-perdida-después-de-commit).

**Criterio:** explicas por qué el cliente no debe reintentar a ciegas y qué experiencia verá el usuario.

### E10 — Backend con cookie

Configura la API de la etapa 1 (cookie de sesión) y argumenta si "stateless" eliminaría CSRF.

**Criterio:** explicas el envío automático de credenciales y no usas CORS como prueba de autorización.
**Negativo:** un formulario desde otro origen no consigue ejecutar una acción que cambia estado.

### E11 — Migración a Keycloak

Dibuja qué pasa con Credential, Session, RefreshToken y Profile si delegas identidad.

**Criterio:** cada responsabilidad tiene un dueño y no hay dos autoridades de contraseña o email por accidente.

### E12 — Revocación con JWT local

Con la API de la etapa 3, cierra sesión en Keycloak y sigue usando el access token.

**Criterio:** mides cuánto tiempo lo acepta la API y lo relacionas con el lifespan del access token.

### E13 — MFA que la API no ve

Activa OTP en Keycloak, haz login con OTP y sin OTP (con un usuario que no lo tenga configurado) y compara `acr` en ambos tokens.

**Criterio:** tu endpoint sensible distingue ambos casos por el token, no por suposición.
**Negativo:** un token sin el nivel requerido recibe 403.

### E14 — Enlaces de un solo uso

Pide dos resets de contraseña seguidos para el mismo usuario y usa el primer enlace, luego el segundo, luego el primero otra vez.

**Criterio:** explicas qué enlaces quedaron válidos y por qué (anota lo que observes en Keycloak; no lo supongas).
**Negativo:** el enlace ya usado se rechaza.

### E15 — Otro lenguaje

Implementa E6 en el segundo framework sin copiar la estructura de carpetas del primero.

**Criterio:** se conserva la propiedad transaccional aunque cambien herramientas y anotaciones.

## 5.4 Pistas

| Ejercicio | Idea que debes descubrir |
|---|---|
| E1 | userId/sub permanecen; el login resuelve el email vigente; el rol de Session no cambia |
| E2 | Comparación estricta now < expiry; convertir unidades a propósito |
| E3 | Un hash coincidente no sustituye la existencia ni el estado de la cuenta |
| E4 | La base decide la unicidad bajo concurrencia |
| E5 | El callback no implica que cualquier repositorio use su misma conexión |
| E6 | Resultado REPLAY confirmado primero; traducción a error después |
| E7 | Verificación criptográfica, semántica de claims y sesión son capas distintas |
| E8 | OWNER es una categoría; la propiedad del recurso es una relación concreta |
| E9 | El servidor consumió el token aunque el cliente no recibió el nuevo |
| E10 | Stateless describe almacenamiento, no si el navegador adjunta credenciales |
| E11 | Perfil y ownership siguen en tu API; el usuario externo se identifica por issuer + sub |
| E12 | Validación local = revocación hasta exp |
| E13 | La API solo sabe lo que el token dice |
| E14 | Un token de un solo uso se invalida al consumirse |
| E15 | El invariante importa más que @Transactional o $transaction |

## 5.5 Cómo depurar con método

Si Nest no resuelve una dependencia:

1. Identifica el token exacto.
2. Localiza su provider.
3. Comprueba el export del módulo propietario.
4. Comprueba el import del consumidor.
5. Reproduce con un TestingModule mínimo.

Si Spring no aplica una transacción:

1. Comprueba qué bean/proxy invocas.
2. Comprueba transaction manager y DataSource.
3. Revisa self-invocation.
4. Revisa tipo de excepción y reglas de rollback.
5. Consulta desde otra conexión para observar el commit real.

Si tienes un 401 inesperado:

1. Comprueba reloj, issuer, audience, algoritmo y kid.
2. Comprueba la sesión y su asociación con el usuario.
3. Registra un código de error seguro; no imprimas el token.

Si falla la concurrencia:

1. Dibuja la secuencia de ambas conexiones.
2. Localiza lecturas fuera del lock.
3. Localiza escrituras fuera de la transacción.
4. Revisa orden de locks e índices.
5. Repite con barreras controladas; no "arregles" con un sleep.

## 5.6 Proyecto final: defender tu arquitectura

Entrega dos versiones pequeñas:

- Una API con autenticación propia y refresh rotatorio (etapas 1–2).
- Una API que delega en Keycloak con MFA activado (etapas 3–4).

Escribe una decisión de arquitectura de una página:

```text
Contexto y requisitos:
Opciones consideradas:
Decisión:
Qué gano:
Qué coste asumo:
Qué requisito no satisface sin trabajo adicional:
Pruebas que sustentan la decisión:
Condición que me haría cambiar de opinión:
```

No justifiques una elección con "es más escalable" sin decir qué escala, qué comparte estado y cómo se recupera.

## 5.7 Rúbrica personal

| Nivel | Evidencia |
|---|---|
| Inicial | Sigues un ejemplo, pero no predices fallos |
| Comprensión | Explicas reglas sin mencionar el framework |
| Implementación | Construyes la regla con pruebas positivas y negativas |
| Solidez | Pruebas concurrencia y respuestas perdidas con recursos reales |
| Criterio | Eliges la solución más simple que cumple los requisitos |
