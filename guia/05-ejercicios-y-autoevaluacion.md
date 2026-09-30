# 5. Aprender sin IA: ejercicios y criterios de dominio

[Índice](README.md) · Lee las pistas solo después de formular tu hipótesis.

La meta es que puedas repetir un razonamiento en una situación nueva. Puedes consultar documentación, mensajes de error, código fuente de librerías y tu depurador. “Sin IA” no significa memorizar una API completa.

## 5.1 Usa una bitácora breve

Para cada sesión escribe:

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
| 1 | Regla de sesión con reloj fijo y pruebas de límites | Persistencia ni seguridad HTTP |
| 2 | Registro/login local con restricciones SQL | Consistencia entre servicios |
| 3 | Endpoint protegido y ownership | Revocación global |
| 4 | Rotación con dos conexiones y replay | Recuperación de registro distribuido |
| 5 | Saga que sobrevive a un reinicio | Contrato real de otro equipo |
| 6 | API Nest o Spring consumiendo Keycloak | Equivalencia completa con StayHub |
| 7 | Comparación escrita de dos arquitecturas | Capacidad operativa de producción |

Avanza cuando puedas demostrar el resultado, no cuando una carpeta tenga muchos archivos.

## 5.3 Ejercicios

### E1 — Identidad y correo

Una persona cambia su correo después de iniciar sesión.

Escribe cuáles de estos datos deberían cambiar: userId, email normalizado, sub, role de Session, refresh vigente.

Comprueba mediante prueba que un login nuevo usa el correo nuevo y que una operación de perfil usa el identificador estable.

**Criterio:** puedes distinguir un atributo editable de una identidad y una proyección de sesión.

### E2 — El límite exacto

Crea una sesión en un instante fijo y prueba un milisegundo antes, exactamente en el límite y un milisegundo después.

Repite en TypeScript y Java. Define explícitamente unidades: JWT usa segundos y tus objetos pueden tener precisión de milisegundos/nanosegundos.

**Criterio:** no hay sleep ni dependencia del reloj real.

### E3 — Cuenta inexistente

Haz que el hasher señuelo devuelva true. ¿Tu caso de uso permite login?

Escribe la prueba antes de corregirlo.

**Criterio:** se exige identidad y credencial activas, no solo coincidencia contra algún hash.

### E4 — Duplicados concurrentes

Dos clientes intentan registrar la misma cuenta simultáneamente. Ambos SELECT iniciales responden que no existe.

Demuestra el fallo sin UNIQUE y la protección con UNIQUE en una base de laboratorio. No elimines restricciones de StayHub para hacer el experimento.

**Criterio:** explicas por qué una preconsulta no arbitra la carrera.

### E5 — Dos transacciones por accidente

Inicia una transacción en Repository A y desde su callback llama un save de Repository B que usa una conexión independiente.

Provoca un error al final.

**Criterio:** muestras qué escritura sobrevivió y lo corriges haciendo explícito el recurso transaccional común.

### E6 — El 401 engañoso

Detecta replay, revoca sesión y lanza una excepción dentro del callback transaccional.

Consulta el estado desde otra conexión después de la respuesta.

**Criterio:** conservas la revocación y devuelves 401, sin desactivar rollback para todos los errores.

### E7 — Token firmado pero incorrecto

Firma con una clave confiable un JWT con aud de otra aplicación. Luego prueba otro con rol ADMIN pero sesión GUEST.

**Criterio:** ambos se rechazan por razones distintas. Una firma válida no autoriza cualquier interpretación.

### E8 — Propietario de qué

Dos usuarios tienen OWNER. El primero intenta editar el perfil del segundo.

**Criterio:** sigue siendo denegado. El guard de roles y el control de ownership responden preguntas diferentes.

### E9 — Respuesta perdida

Users activa un usuario y la respuesta se pierde.

Diseña el siguiente request de Auth y su decisión para ACTIVE, PENDING y dependencia inaccesible.

**Criterio:** no equiparas timeout con ausencia ni borras una cuenta expuesta.

### E10 — Reconciliar sin contraseña

Reinicia Auth con User PENDING y sin Credential persistida. No tienes request original.

**Criterio:** explicas por qué no puedes completar automáticamente esa parte y qué política segura permite converger.

### E11 — Dos workers y un lease

Pausa A más allá del vencimiento, deja que B avance y reanuda A.

**Criterio:** la escritura tardía de A es rechazada; además explicas qué protección necesita una llamada remota tardía.

### E12 — “Redis está caído”

Aplica el mismo fallo a dos operaciones: verificar sesión y contar fallos de login.

**Criterio:** eliges comportamientos diferentes según la política y no haces catch vacío para todas las excepciones.

### E13 — Backend con cookie

Configura una API que autentica mediante cookie y argumenta si STATELESS elimina CSRF.

**Criterio:** explicas el envío automático de credenciales y no usas CORS como prueba de autorización.

### E14 — Migración a Keycloak

Dibuja qué ocurre con Credential, Registration, Session y Profile si delegas identidad.

**Criterio:** cada responsabilidad tiene un dueño y no existen dos autoridades de password/email por accidente.

### E15 — Otro lenguaje

Implementa el caso E6 en el segundo framework sin copiar la estructura de carpetas del primero.

**Criterio:** conserva la propiedad transaccional aunque cambien herramientas y anotaciones.

## 5.4 Pistas de solución

Lee esta sección después de escribir tu propuesta.

| Ejercicio | Idea que debes descubrir |
|---|---|
| E1 | userId/sub permanecen; nuevo login resuelve email vigente; rol de Session no cambia en esta feature |
| E2 | Comparación estricta now < expiry; convertir unidades deliberadamente |
| E3 | Hash coincidente no sustituye la existencia ni el estado de una cuenta |
| E4 | La base propietaria decide unicidad de manera concurrente |
| E5 | El callback no implica que cualquier repositorio use su misma conexión |
| E6 | Resultado REPLAY confirmado primero, traducción a error después |
| E7 | Verificación criptográfica, semántica de claims y sesión son capas necesarias |
| E8 | OWNER es categoría; propiedad del recurso es una relación concreta |
| E9 | Consultar estado e identificar la misma operación por registrationId |
| E10 | Reintento del cliente o compensación de estado interno; no inventar password |
| E11 | Propiedad temporal comprobada y protección del receptor remoto |
| E12 | DB puede suplir cache; no sustituye automáticamente el contador antiabuso obligatorio |
| E13 | Stateless describe almacenamiento, no si el navegador adjunta credenciales |
| E14 | Perfil/ownership siguen en negocio; identificar usuario externo por issuer/sub |
| E15 | El invariante importa más que @Transactional o $transaction |

## 5.5 Cómo depurar con método

Si Nest no resuelve una dependencia:

1. Identifica el token exacto.
2. Localiza su provider.
3. Comprueba export del módulo propietario.
4. Comprueba import del consumidor.
5. Reproduce con un TestingModule mínimo.

Si Spring no aplica una transacción:

1. Comprueba qué bean/proxy invocas.
2. Comprueba transaction manager y DataSource.
3. Revisa self-invocation.
4. Revisa tipo de excepción y reglas de rollback.
5. Consulta desde una conexión diferente para observar commit real.

Si tienes 401 inesperado:

1. Distingue token de usuario y de servicio.
2. Comprueba reloj, issuer, audience, algoritmo y kid.
3. Comprueba la sesión y asociación de usuario.
4. Observa un código de error seguro, no imprimas el token.

Si falla concurrencia:

1. Dibuja la secuencia de ambas conexiones.
2. Localiza lecturas fuera del lock.
3. Localiza writes fuera de la transacción.
4. Revisa orden de locks e índices.
5. Repite con barreras controladas; no “arregles” agregando un sleep.

## 5.6 Proyecto final: defender tu arquitectura

Entrega dos versiones pequeñas:

- Una API con autenticación propia y refresh rotatorio.
- Una API que delega autenticación a Keycloak.

Pueden usar el mismo framework. Reescribe solo una operación crítica en el segundo lenguaje para comprobar transferencia.

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

No justifiques una elección con “es más escalable” sin decir qué escala, qué comparte estado y cómo se recupera.

## 5.7 Rúbrica personal

| Nivel | Evidencia |
|---|---|
| Inicial | Puedes seguir un ejemplo, pero no predecir fallos |
| Comprensión | Explicas reglas sin mencionar el framework |
| Implementación | Construyes la regla y pruebas positivos/negativos |
| Solidez | Pruebas concurrencia, caída y recuperación con recursos reales |
| Criterio | Eliges una solución más simple cuando los requisitos lo permiten |

No necesitas alcanzar el último nivel en todos los temas antes de avanzar. Identifica dónde estás, conserva evidencia y practica el siguiente paso.
