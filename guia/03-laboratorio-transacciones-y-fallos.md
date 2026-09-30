# 3. Laboratorio: observar los fallos que justifican los patrones

[Índice](README.md) · Se usa desde los recorridos [Nest](nest/README.md) y [Spring](spring/README.md).

Objetivo: que puedas ver locks, rollback y resultados ambiguos sin atribuirlos a magia del framework.

## Reglas del laboratorio

Usa PostgreSQL 16 en una **base desechable creada para aprender**, con dos terminales psql conectadas a la misma base. No uses auth_db de trabajo. Los SQL siguientes son ejecutables en ese laboratorio; no usan el esquema real del proyecto.

No se ejecutaron durante la redacción de la guía. Predice el resultado, ejecútalos y conserva tu evidencia. Cada montaje se realiza una vez en una base nueva; si lo repites con los mismos IDs, encontrarás conflictos deliberados.

## Laboratorio A: unicidad ante dos registros

Montaje, una vez:

```sql
CREATE SCHEMA auth_learning;
CREATE TABLE auth_learning.account (
  id text PRIMARY KEY,
  email_normalized text NOT NULL UNIQUE
);
```

En terminal A:

```sql
BEGIN;
SELECT * FROM auth_learning.account
WHERE email_normalized = 'persona@example.test';
INSERT INTO auth_learning.account VALUES ('u-a', 'persona@example.test');
-- Deja abierta la transacción.
```

En terminal B:

```sql
BEGIN;
SELECT * FROM auth_learning.account
WHERE email_normalized = 'persona@example.test';
INSERT INTO auth_learning.account VALUES ('u-b', 'persona@example.test');
-- Esperará la decisión de A.
```

Ahora COMMIT en A. El INSERT de B debe terminar en violación de unicidad. Haz ROLLBACK en B para salir de la transacción abortada.

Qué observar:

1. Ambos SELECT pudieron observar ausencia.
2. La preconsulta no coordinó los escritores.
3. El índice decidió quién podía confirmar.

**Transferencia a StayHub:** Users debe tener la restricción de correo. Auth no puede garantizarla manteniendo un Set de correos en memoria.

## Laboratorio B: una familia de refresh

Montaje:

```sql
CREATE TABLE auth_learning.session (
  id text PRIMARY KEY,
  user_id text NOT NULL,
  absolute_expires_at timestamptz NOT NULL,
  revoked_at timestamptz,
  version integer NOT NULL DEFAULT 1 CHECK (version > 0)
);

CREATE TABLE auth_learning.refresh_token (
  id text PRIMARY KEY,
  session_id text NOT NULL REFERENCES auth_learning.session(id),
  state text NOT NULL CHECK (state IN ('ACTIVE', 'CONSUMED', 'REVOKED')),
  consumed_at timestamptz,
  successor_id text REFERENCES auth_learning.refresh_token(id)
);

CREATE UNIQUE INDEX one_active_refresh
  ON auth_learning.refresh_token(session_id)
  WHERE state = 'ACTIVE';

INSERT INTO auth_learning.session
  (id, user_id, absolute_expires_at)
VALUES ('s-1', 'u-a', now() + interval '168 hours');

INSERT INTO auth_learning.refresh_token(id, session_id, state)
VALUES ('t-1', 's-1', 'ACTIVE');
```

Se omiten tokenHash y criptografía para aislar la transacción. Los IDs son etiquetas didácticas, no tokens utilizables.

### B1. Intenta el orden incorrecto

```sql
BEGIN;
INSERT INTO auth_learning.refresh_token(id, session_id, state)
VALUES ('t-2', 's-1', 'ACTIVE');
-- Falla: ya existe un ACTIVE para s-1.
ROLLBACK;
```

Otro orden incorrecto: asignar successor_id='t-2' cuando t-2 no existe. La FK inmediata rechaza el enlace.

No elimines el índice o la FK. Corrige la secuencia.

### B2. Rotación ordenada

Terminal A:

```sql
BEGIN;
SELECT * FROM auth_learning.session WHERE id = 's-1' FOR UPDATE;
SELECT * FROM auth_learning.refresh_token WHERE id = 't-1' FOR UPDATE;
-- Aplicación comprueba sesión activa, no vencida y token ACTIVE.

UPDATE auth_learning.refresh_token
SET state = 'CONSUMED', consumed_at = now()
WHERE id = 't-1';

INSERT INTO auth_learning.refresh_token(id, session_id, state)
VALUES ('t-2', 's-1', 'ACTIVE');

UPDATE auth_learning.refresh_token
SET successor_id = 't-2'
WHERE id = 't-1';

UPDATE auth_learning.session
SET version = version + 1
WHERE id = 's-1';
-- Todavía no confirmes.
```

Terminal B intenta reutilizar t-1:

```sql
BEGIN;
SELECT * FROM auth_learning.session WHERE id = 's-1' FOR UPDATE;
-- Espera mientras A mantiene el lock.
```

Confirma A con COMMIT. En B, después de obtener el lock:

```sql
SELECT * FROM auth_learning.refresh_token WHERE id = 't-1' FOR UPDATE;
-- Ahora observa CONSUMED: es replay.

UPDATE auth_learning.session
SET revoked_at = now(), version = version + 1
WHERE id = 's-1' AND revoked_at IS NULL;

UPDATE auth_learning.refresh_token
SET state = 'REVOKED'
WHERE session_id = 's-1' AND state = 'ACTIVE';
COMMIT;
```

Consulta desde cualquiera, fuera de transacción:

```sql
SELECT id, revoked_at, version FROM auth_learning.session WHERE id = 's-1';
SELECT id, state, successor_id
FROM auth_learning.refresh_token WHERE session_id = 's-1' ORDER BY id;
```

Resultado: sesión revocada, t-1 consumido y t-2 revocado. No hay refresh ACTIVE.

En READ COMMITTED el trabajador que espera debe releer el estado después de adquirir el lock. Con otros niveles puede recibir error de serialización y necesitar reintento acotado. Estudia bloqueo de filas y deadlocks en [PostgreSQL](https://www.postgresql.org/docs/16/explicit-locking.html).

**Transferencia al código:** Prisma o JDBC deben usar una transacción común y el orden Session → RefreshToken. Una prueba con mocks no demuestra este resultado.

### B3. Revocar y luego hacer rollback

Prepara otra sesión:

```sql
INSERT INTO auth_learning.session(id, user_id, absolute_expires_at)
VALUES ('s-rollback', 'u-a', now() + interval '168 hours');

BEGIN;
UPDATE auth_learning.session
SET revoked_at = now() WHERE id = 's-rollback';
ROLLBACK;

SELECT revoked_at FROM auth_learning.session WHERE id = 's-rollback';
```

revoked_at sigue siendo null. Si tu framework hizo rollback porque lanzaste una excepción tras revocar, la respuesta puede haber dicho 401 sin conservar la revocación.

Solución conceptual: devolver un resultado REPLAY dentro del callback, confirmar y convertirlo a error HTTP afuera. Un fallo técnico durante las escrituras, en cambio, sí debe revertirlas.

## Laboratorio C: respuesta perdida después de commit

Haz que el servidor ejecute una rotación válida y cierre la conexión antes de enviar la respuesta.

Predice:

- El cliente conserva el refresh viejo.
- El servidor ya lo consumió.
- Reintentar ese token se interpreta como replay bajo la política estricta de StayHub.

Conclusión: el frontend no puede reintentar refresh como un GET inocuo. Debe coordinar renovaciones simultáneas y manejar la necesidad de volver a iniciar sesión.

Un mecanismo “single flight” comparte una sola renovación en curso dentro de una instancia cliente. Varias pestañas necesitan coordinación adicional. Una ventana de tolerancia/idempotencia de refresh sería otra política, con riesgos y requisitos distintos; no se añade silenciosamente para hacer pasar la prueba actual.

Escribe una prueba con dos promesas de refresh y otra con respuesta perdida. Asegura que no mezclas ambas causas.

## Laboratorio D: timeout después de activar el usuario

Construye un stub HTTP con memoria:

1. Recibe activate(registrationId).
2. Cambia el usuario a ACTIVE.
3. No responde hasta superar el timeout de Auth.

Auth recibe una excepción de timeout. Pregunta: ¿debe cancelar al usuario?

No tiene evidencia suficiente. En la siguiente ejecución debe consultar el estado remoto:

| Users | Credential | Acción |
|---|---|---|
| ACTIVE | ACTIVE | Completar registro |
| PENDING | ACTIVE/PENDING | Continuar si todavía corresponde |
| PENDING | Ausente | Esperar request/expirar: falta contraseña |
| CANCELLED | Cualquier estado local compatible | Revocar/cancelar localmente |
| Desconocido por timeout | Cualquiera | Conservar avance y reintentar |

No confundas 404 confirmado con excepción de conexión.

**Transferencia:** la saga no se prueba únicamente con “Users responde 201”. Debe sobrevivir a un reinicio después de cada efecto.

## Laboratorio E: trabajador antiguo

Simula:

```text
10:00 A reclama registro, lease hasta 10:02
10:01 A se pausa
10:03 B reclama y avanza
10:04 A vuelve e intenta escribir
```

La escritura de A debe incluir su condición de propiedad y vigencia; si afecta cero filas, perdió el derecho a avanzar.

Después añade una llamada externa en vuelo de A. Su comprobación de lease antes de enviarla no garantiza que B no reclame mientras la red tarda. El receptor necesita idempotencia/precondiciones para que una llamada tardía no destruya una identidad ya activada.

**Ejercicio avanzado:** diseña un fencing token monotónico. Explica quién lo genera y quién rechaza uno antiguo. Si solo lo valida el emisor local, todavía no protegiste el recurso remoto.

## Laboratorio F: partición de Redis y caché vieja

Preparación:

1. Session está ACTIVE en PostgreSQL.
2. Redis contiene una copia ACTIVE.
3. Revoca Session en PostgreSQL.
4. Simula fallo al eliminar la copia Redis.

Si authorize usa solo la caché, permitirá acceso indebido durante su vigencia. El TTL no equivale a revocación inmediata.

Repite con Redis caído:

- Validación de sesión puede consultar DB.
- Rate limit definido como obligatorio no puede “dejar pasar hasta que vuelva Redis”.

Una misma dependencia tiene políticas de fallo diferentes según la función.

## Laboratorio G: retries y efectos externos

Supón una transacción que se reintenta por deadlock y dentro envía un correo. El primer intento pudo enviar y luego hacer rollback. El segundo lo enviaría otra vez.

Poner un efecto externo dentro de una función de retry no lo vuelve transaccional.

Dibuja cómo una outbox permitiría confirmar dato y mensaje pendiente juntos. Luego demuestra por qué el consumidor aún debe soportar reentrega.

## Cómo registrar tus resultados

Por experimento guarda:

- Predicción inicial.
- Pasos y orden real.
- Estado final observado desde una conexión nueva.
- Error/estado HTTP si aplica.
- Explicación del invariante protegido.
- Cambio mínimo que rompe la garantía.

Puedes automatizar después. Primero observa el fenómeno y aprende a distinguir una transacción correcta de una función que solo se llama “transaction”.
