# Apéndice opcional: cuando Auth se reparte entre servicios

[Índice](README.md)

La ruta principal usa **un servicio y una base**. Este apéndice conserva el material de la versión anterior de la guía para cuando quieras estudiar qué se rompe al separar identidad (Users) y credencial (Auth) en procesos y bases distintas. No lo necesitas para completar las etapas 1–4.

Léelo solo si puedes nombrar el requisito que te obliga a separar: "queda más profesional" no es uno.

## A1. Identidad de servicio frente a identidad de usuario

Si un Gateway llama a Auth, esa llamada lleva una credencial **del Gateway**. La sesión del usuario es otro contexto.

No aceptes "x-user-id: tal" como evidencia por estar dentro de Docker. Define qué emisor, audiencia y permisos necesita cada llamador.

Ejemplo de contrato con Gateway:

- Authorization de las rutas internas de Auth transporta un service JWT.
- La validación interna recibe sessionId y userId que el Gateway obtuvo de un JWT de usuario ya validado.
- La respuesta interna de login contiene el refresh en JSON; la cookie pública la maneja el Gateway.

Separar estas capas evita meter dos bearer distintos en el mismo header o aceptar roles enviados por el navegador. Para llamadas sin usuario, considera client credentials con scopes/audiencias mínimos, o mTLS. Un token de máquina no prueba que un usuario autorizó una acción.

## A2. Idempotencia con clave

Misma key y mismo contenido = misma operación. Misma key y contenido distinto = conflicto.

El fingerprint permite comparar sin guardar el payload. Si contiene datos de baja entropía o derivados de la contraseña, usa un HMAC con secreto del servidor, no un hash público.

Dos problemas independientes:

1. Repetir una key no crea otra operación (lo resuelve Auth).
2. Dos keys distintas con el mismo correo no crean dos cuentas (lo resuelve la UNIQUE de Users).

Coste oculto: qué devuelves al reintentar después de completar. Si Auth no guarda perfiles, tiene que consultar a Users, y ese reintento puede dar 503.

## A3. Saga: coordinar confirmaciones locales

Una saga combina pasos locales confirmados y acciones de compensación. En la orquestación, un coordinador decide el siguiente paso; en la coreografía, los participantes reaccionan a eventos. [Saga orquestada](https://docs.aws.amazon.com/prescriptive-guidance/latest/cloud-design-patterns/saga-orchestration.html).

Registro repartido:

1. Auth registra el avance.
2. Users crea una identidad no autenticable.
3. Auth crea/activa la credencial.
4. Users activa la identidad.
5. Auth confirma ambos lados.

Estados:

```text
STARTED → USER_PENDING → CREDENTIAL_PENDING → CREDENTIAL_ACTIVE → COMPLETED
   estados recuperables → COMPENSATING → CANCELLED
```

COMPLETED exige observar identidad y credencial activas, no "ya llamé activate". Cada paso debe sobrevivir a la caída del coordinador; un try/catch con delete al final no lo consigue.

Compensar no es un rollback temporal: puedes cancelar una identidad aún interna, no borrar en silencio una cuenta que el usuario ya usó.

No mantengas una transacción abierta mientras esperas a Users: el servidor remoto no comparte ese rollback.

Limitación importante: si Auth no guarda nombre, correo ni contraseña en claro, un worker no puede recrearlos tras perder la request. En los pasos sin información suficiente debe esperar a que el cliente reintente o cancelar estados internos al vencer. Reconciliar no es inventar datos.

## A4. Reconciliación, leases y fencing

Reconciliar es comparar el avance registrado con la realidad y corregir una operación incompleta.

Un lease concede propiedad temporal: el worker A reclama hasta las 10:02; si muere, B puede continuar después. Pero A podría estar pausado, no muerto. Si vuelve, debe comprobar que sigue siendo dueño antes de escribir.

Un UUID de owner validado en cada escritura local rechaza al trabajador antiguo. Para proteger efectos en un sistema **remoto** no basta: necesitas operaciones idempotentes, precondiciones remotas y, cuando corresponda, **fencing tokens** monotónicos que valide el recurso receptor.

`SKIP LOCKED` ayuda a repartir filas entre workers, pero no garantiza recuperación tras commit: al soltar los locks necesitas estado durable del reclamo. [PostgreSQL SELECT](https://www.postgresql.org/docs/16/sql-select.html).

Un método `@Scheduled` de Spring se ejecuta en cada instancia habilitada; no implica un único worker global.

## A5. Resiliencia, caché distribuida, rate limit con Redis y outbox

| Técnica | Decisión | Error frecuente |
|---|---|---|
| Timeout | Cuánto espero antes de dar resultado desconocido | Interpretarlo como "no ocurrió" |
| Retry | Qué fallo puedo repetir y cuántas veces | Repetir un POST no idempotente |
| Backoff y jitter | Cuándo reintento sin sincronizar clientes | Reintentos instantáneos masivos |
| Circuit breaker | Cuándo dejo de llamar a una dependencia caída | Considerarlo sustituto del timeout |

Un fallo de Users durante login es 503, no "contraseña incorrecta". Un circuit breaker abierto no debe convertirse en "usuario inexistente".

Caché de sesión en Redis: un TTL corto reduce el intervalo de revocación, no lo hace cero, y la invalidación puede fallar. Si falla la caché puedes consultar la base; si falla el contador antiabuso obligatorio, fallas cerrado (503).

Rate limit compartido: contador por HMAC del correo en Redis con un script Lua (atomicidad dentro de Redis, no con PostgreSQL). Un Map en memoria no cuenta entre réplicas.

**Outbox:** escribir en la base y luego publicar un evento tiene una grieta (el proceso cae entre ambos). Una outbox guarda el cambio y el mensaje en la misma transacción local; un publicador lo envía después. Puede haber reentrega, así que el consumidor debe ser idempotente. [Transactional outbox](https://docs.aws.amazon.com/prescriptive-guidance/latest/cloud-design-patterns/transactional-outbox.html).

## A6. Laboratorios distribuidos (opcionales)

### Laboratorio D: timeout después de activar el usuario

Stub HTTP con memoria:

1. Recibe activate(registrationId).
2. Cambia el usuario a ACTIVE.
3. No responde hasta superar el timeout de Auth.

Auth recibe un timeout. ¿Debe cancelar al usuario? No tiene evidencia. En la siguiente ejecución consulta el estado remoto:

| Users | Credential | Acción |
|---|---|---|
| ACTIVE | ACTIVE | Completar registro |
| PENDING | ACTIVE/PENDING | Continuar si corresponde |
| PENDING | Ausente | Esperar request/expirar: falta contraseña |
| CANCELLED | Cualquier estado local compatible | Revocar/cancelar localmente |
| Desconocido por timeout | Cualquiera | Conservar avance y reintentar |

No confundas un 404 confirmado con una excepción de conexión.

### Laboratorio E: trabajador antiguo

```text
10:00 A reclama registro, lease hasta 10:02
10:01 A se pausa
10:03 B reclama y avanza
10:04 A vuelve e intenta escribir
```

La escritura de A debe incluir su condición de propiedad y vigencia; si afecta cero filas, perdió el derecho a avanzar.

Añade una llamada externa en vuelo de A: comprobar el lease antes de enviarla no impide que B reclame mientras la red tarda. El receptor necesita idempotencia o precondiciones.

**Ejercicio avanzado:** diseña un fencing token monotónico. ¿Quién lo genera y quién rechaza uno antiguo? Si solo lo valida el emisor, no protegiste el recurso remoto.

### Laboratorio F: partición de Redis y caché vieja

1. Session ACTIVE en PostgreSQL.
2. Redis contiene una copia ACTIVE.
3. Revoca Session en PostgreSQL.
4. Simula fallo al borrar la copia en Redis.

Si authorize usa solo la caché, permitirá acceso indebido durante su vigencia. Repite con Redis caído: la validación de sesión puede consultar la base; el rate limit obligatorio no puede "dejar pasar hasta que vuelva".

### Laboratorio G: retries y efectos externos

Una transacción que se reintenta por deadlock envía un correo dentro. El primer intento pudo enviarlo y luego hacer rollback; el segundo lo envía otra vez. Dibuja cómo una outbox confirmaría dato y mensaje juntos, y por qué el consumidor aún debe tolerar reentregas.

## A7. Ejercicios distribuidos

- **D1 — Respuesta perdida tras activar:** diseña la siguiente request de Auth y su decisión para ACTIVE, PENDING y dependencia inaccesible. *Criterio:* no equiparas timeout con ausencia ni borras una cuenta expuesta.
- **D2 — Reconciliar sin contraseña:** reinicia Auth con User PENDING y sin Credential; no tienes la request original. *Criterio:* explicas por qué no puedes completar automáticamente y qué política segura converge.
- **D3 — Dos workers y un lease:** pausa A más allá del vencimiento, deja avanzar a B y reanuda A. *Criterio:* la escritura tardía de A se rechaza y explicas qué protección necesita una llamada remota tardía.
- **D4 — "Redis está caído":** aplica el mismo fallo a verificar sesión y a contar fallos de login. *Criterio:* comportamientos diferentes según la política, sin catch vacío.

## A8. Keycloak frente a reglas propias estrictas

Si tu Auth propio promete reglas que un proveedor quizá no replica, compruébalas antes de migrar:

| Regla propia | Qué comprobar con el proveedor |
|---|---|
| Access de una hora | Configuración del realm/cliente y exp efectivo |
| Límite absoluto de siete días desde login | SSO Session Max frente a sesión de cliente e idle timeout |
| Replay revoca la familia completa | Comportamiento real de "Revoke Refresh Token" y tolerancia a reuso |
| Rol inmutable durante la sesión | Si el refresh recalcula roles actuales |
| Revocación inmediata en las APIs | Validación local frente a introspección/backchannel |

Si la alternativa obliga a cambiar esas promesas, cambia primero la especificación; no escondas la diferencia en un adaptador.

## A9. Réplicas y alta disponibilidad

Varias réplicas de Keycloak no eliminan una base única como punto de fallo. [Alta disponibilidad](https://www.keycloak.org/high-availability/introduction). En producción hacen falta HTTPS/hostname, almacenamiento, secretos y plan de actualización. [Contenedores](https://www.keycloak.org/server/containers).
