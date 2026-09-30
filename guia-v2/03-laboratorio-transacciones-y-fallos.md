# 3. Laboratorio SQL: observar los fallos que justifican los patrones

[Índice](README.md) · Se usa desde los recorridos [Nest](nest/README.md) y [Spring](spring/README.md).

Objetivo: ver con tus ojos unicidad bajo concurrencia, locks, rollback y respuestas perdidas, sin atribuirlos a magia del framework.

Los laboratorios D (timeout tras activar usuario remoto), E (trabajador antiguo y fencing), F (partición de Redis) y G (retries con efectos externos) se movieron al [apéndice distribuido](apendice-distribuido.md#a6-laboratorios-distribuidos-opcionales).

## Reglas del laboratorio

Usa PostgreSQL 16 en una **base desechable**, con dos terminales psql conectadas a la misma base. Los SQL no usan el esquema de ningún proyecto real.

> **Estado de verificación:** estos SQL se revisaron por lectura contra la documentación de PostgreSQL 16 (restricciones UNIQUE, índices parciales, `SELECT ... FOR UPDATE` en READ COMMITTED). **No se ejecutaron** en esta revisión. Los resultados esperados y los nombres de restricciones de los mensajes de error son los que PostgreSQL genera por defecto; compáralos con lo que obtengas y anota cualquier diferencia.

Base desechable con Docker (o Podman, cambiando `docker` por `podman`):

```sh
docker run --rm --name authlab-pg16 \
  -e POSTGRES_PASSWORD=lab \
  -e POSTGRES_DB=authlab \
  -p 127.0.0.1:5433:5432 \
  docker.io/library/postgres:16
```

En cada terminal:

```sh
docker exec -it authlab-pg16 psql -U postgres -d authlab
```

`--rm` borra el contenedor al pararlo (`docker stop authlab-pg16`). La contraseña es solo para este laboratorio local.

Cada montaje se hace una vez en una base nueva; si lo repites con los mismos IDs, verás conflictos deliberados.

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
-- Se queda esperando la decisión de A.
```

Ahora `COMMIT;` en A.

**Resultado esperado:**

- Los dos SELECT devuelven 0 filas: ambos "vieron" que el correo estaba libre.
- El INSERT de B se bloquea hasta el COMMIT de A y entonces falla con `ERROR: duplicate key value violates unique constraint "account_email_normalized_key"`.
- La transacción de B queda abortada: cualquier sentencia siguiente da `current transaction is aborted`. Sal con `ROLLBACK;`.
- `SELECT * FROM auth_learning.account;` devuelve una sola fila: `u-a`.

Si A hubiera hecho ROLLBACK en vez de COMMIT, el INSERT de B habría terminado con éxito. Pruébalo también.

### A2 (negativo): sin UNIQUE

```sql
CREATE TABLE auth_learning.account_sin_unique (
  id text PRIMARY KEY,
  email_normalized text NOT NULL
);
```

Repite los mismos pasos contra esta tabla. **Resultado esperado:** B no se bloquea, ambos COMMIT tienen éxito y quedan dos filas con el mismo correo. Esa es la carrera que la preconsulta no evita.

**Qué observar:**

1. La preconsulta no coordina a los escritores.
2. El índice decide quién puede confirmar.

**Transferencia al código:** la restricción UNIQUE va en la migración. Un Set de correos en memoria no protege nada con dos peticiones simultáneas.

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

Se omiten tokenHash y criptografía para aislar la transacción. Los IDs son etiquetas, no tokens utilizables.

### B1. Intenta el orden incorrecto

```sql
BEGIN;
INSERT INTO auth_learning.refresh_token(id, session_id, state)
VALUES ('t-2', 's-1', 'ACTIVE');
ROLLBACK;
```

**Resultado esperado:** el INSERT falla con `duplicate key value violates unique constraint "one_active_refresh"`, porque ya hay un ACTIVE para s-1.

Otro orden incorrecto:

```sql
UPDATE auth_learning.refresh_token SET successor_id = 't-2' WHERE id = 't-1';
```

**Resultado esperado:** falla con `insert or update on table "refresh_token" violates foreign key constraint "refresh_token_successor_id_fkey"`, porque t-2 no existe.

No elimines el índice ni la FK. Corrige la secuencia.

### B2. Rotación ordenada y replay concurrente

Terminal A:

```sql
BEGIN;
SELECT * FROM auth_learning.session WHERE id = 's-1' FOR UPDATE;
SELECT * FROM auth_learning.refresh_token WHERE id = 't-1' FOR UPDATE;
-- La aplicación comprobaría: sesión no revocada, no vencida, token ACTIVE.

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
-- Se bloquea mientras A mantiene el lock.
```

Confirma A con `COMMIT;`. En B, el SELECT se desbloquea y devuelve la fila **ya actualizada** (version = 2): en READ COMMITTED, `FOR UPDATE` relee la versión confirmada de la fila tras esperar. Continúa en B:

```sql
SELECT * FROM auth_learning.refresh_token WHERE id = 't-1' FOR UPDATE;
-- Observa state = CONSUMED: es un replay.

UPDATE auth_learning.session
SET revoked_at = now(), version = version + 1
WHERE id = 's-1' AND revoked_at IS NULL;

UPDATE auth_learning.refresh_token
SET state = 'REVOKED'
WHERE session_id = 's-1' AND state = 'ACTIVE';
COMMIT;
```

Consulta desde cualquiera de las dos, fuera de transacción:

```sql
SELECT id, revoked_at IS NOT NULL AS revocada, version
FROM auth_learning.session WHERE id = 's-1';

SELECT id, state, successor_id
FROM auth_learning.refresh_token WHERE session_id = 's-1' ORDER BY id;
```

**Resultado esperado:**

| session | revocada | version |
|---|---|---|
| s-1 | true | 3 |

| id | state | successor_id |
|---|---|---|
| t-1 | CONSUMED | t-2 |
| t-2 | REVOKED | null |

No queda ningún refresh ACTIVE. La versión es 3 porque A la llevó de 1 a 2 y B de 2 a 3.

Con REPEATABLE READ o SERIALIZABLE, B no habría releído la fila: habría recibido un error de serialización (`could not serialize access due to concurrent update`) y la aplicación tendría que reintentar de forma acotada. Estudia bloqueo de filas y deadlocks en [PostgreSQL 16: explicit locking](https://www.postgresql.org/docs/16/explicit-locking.html) y [niveles de aislamiento](https://www.postgresql.org/docs/16/transaction-iso.html).

**Transferencia al código:** Prisma o JDBC deben usar una transacción común y el orden Session → RefreshToken. Una prueba con mocks no demuestra este resultado.

### B3. Revocar y luego hacer rollback

```sql
INSERT INTO auth_learning.session(id, user_id, absolute_expires_at)
VALUES ('s-rollback', 'u-a', now() + interval '168 hours');

BEGIN;
UPDATE auth_learning.session
SET revoked_at = now() WHERE id = 's-rollback';
ROLLBACK;

SELECT revoked_at FROM auth_learning.session WHERE id = 's-rollback';
```

**Resultado esperado:** revoked_at sigue siendo null.

Transferencia: si tu framework hizo rollback porque lanzaste una excepción justo después de revocar, la respuesta pudo decir 401 sin que la revocación se guardara.

Solución: devolver un resultado REPLAY desde el callback transaccional, dejar que la transacción confirme y convertir ese resultado a 401 **fuera**. Un fallo técnico durante las escrituras, en cambio, sí debe revertirlas.

## Laboratorio C: respuesta perdida después de commit

Haz que tu servidor ejecute una rotación válida y cierre la conexión antes de enviar la respuesta (por ejemplo, un flag de test que destruya el socket después del commit).

Predice:

- El cliente conserva el refresh viejo.
- El servidor ya lo consumió.
- Reintentar ese token se interpreta como replay: la sesión se revoca.

Conclusión: el frontend no puede reintentar un refresh como si fuera un GET inocuo. Debe coordinar renovaciones simultáneas y aceptar que a veces hará falta volver a iniciar sesión.

Un mecanismo "single flight" comparte una sola renovación en curso dentro de una instancia de cliente. Varias pestañas necesitan coordinación adicional. Una ventana de tolerancia para reuso sería otra política, con riesgos distintos; no la añadas en silencio para que pase una prueba.

**Tests que debes escribir:**

- Positivo: un refresh válido devuelve un par nuevo y el viejo pasa a CONSUMED.
- Negativo: dos refresh simultáneos con el mismo token → como mucho uno obtiene 200; el otro 401 y la sesión queda revocada.
- Negativo: respuesta perdida + reintento → 401 y sesión revocada.

No mezcles las dos causas en la misma prueba.

## Cómo registrar tus resultados

Por experimento guarda:

- Predicción inicial.
- Pasos y orden real.
- Estado final observado desde una conexión nueva.
- Error/estado HTTP si aplica.
- Invariante protegido.
- Cambio mínimo que rompe la garantía.

Primero observa el fenómeno. Después automatízalo.
