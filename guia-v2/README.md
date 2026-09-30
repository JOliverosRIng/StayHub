# Aprender autenticación con un proyecto pequeño

Esta guía existe para que entiendas autenticación construyendo un servicio pequeño tú mismo, con documentación a mano y experimentos. El objetivo es **aprender**, no llevar nada a producción. El caso de estudio se inspira en StayHub (huéspedes, propietarios, perfiles), pero la guía es independiente del repositorio.

La decisión de arquitectura es deliberadamente simple: **un solo servicio de Auth y una sola base de datos**. Identidad y credencial se guardan en la misma transacción. Así puedes concentrarte en contraseñas, sesiones, tokens, concurrencia del refresh y delegación a Keycloak sin cargar con la coordinación entre servicios. Lo distribuido (saga, leases, reconciliación, fencing tokens) queda en un [apéndice opcional](apendice-distribuido.md).

## Ruta

```text
Etapa 1  Registro + login con Argon2id y sesión opaca en cookie
Etapa 2  JWT de acceso + refresh opaco rotatorio con detección de replay
Etapa 3  API protegida por Keycloak (Authorization Code + PKCE)
Etapa 4  MFA (TOTP y passkeys), verificación de email y recuperación de contraseña
```

Cada etapa se construye sobre la anterior. Conserva el código de cada una en una rama o carpeta propia: comparar lo que cambia es parte del aprendizaje.

| Lectura | Qué aprenderás | Cuándo |
|---|---|---|
| [1. Fundamentos](01-fundamentos.md) | Identidad, sesión, contraseñas, JWT, OAuth/OIDC | Antes de programar |
| [2. Patrones y decisiones](02-patrones-y-decisiones.md) | Qué problema resuelve cada patrón y cuándo sobra | Antes de la etapa 1 |
| [Recorrido NestJS](nest/README.md) | Etapas 1–3 con TypeScript, Nest y Prisma | Elige **uno** de los dos recorridos |
| [Recorrido Spring](spring/README.md) | Etapas 1–3 con Java, Spring Boot 4 y Spring Security 7 | Alternativa al recorrido Nest |
| [3. Laboratorio SQL](03-laboratorio-transacciones-y-fallos.md) | Unicidad, locks, rollback y respuesta perdida | Antes de la etapa 2 |
| [4. Keycloak](04-keycloak-y-alternativas.md) | Delegar login con Authorization Code + PKCE | Etapa 3 |
| [7. MFA, email y recuperación](07-mfa-email-recuperacion.md) | TOTP, passkeys, verificación y reset con Keycloak | Etapa 4 |
| [5. Ejercicios](05-ejercicios-y-autoevaluacion.md) | Practicar y comprobar comprensión | Durante todo el recorrido |
| [6. Fuentes y versiones](06-fuentes-y-versiones.md) | Documentación oficial y versiones verificadas | Al preparar cada etapa |
| [Apéndice: Auth distribuido](apendice-distribuido.md) | Saga, leases, reconciliación, fencing, Redis, outbox | Opcional, después de la etapa 4 |

## Cómo estudiar cada unidad

1. **Antes de programar:** escribe entrada, salida, reglas que siempre deben cumplirse y tres errores posibles.
2. **Lee lo mínimo necesario:** una sección de documentación oficial relacionada con el problema.
3. **Implementa una parte observable:** por ejemplo, rechazar una contraseña incorrecta sin crear sesión.
4. **Predice y prueba:** anota el resultado esperado antes de ejecutar.
5. **Escribe el test negativo:** cada capacidad nueva viene con al menos una prueba que demuestra lo que **no** debe permitir.
6. **Provoca un fallo:** dos peticiones simultáneas, token vencido, respuesta perdida.
7. **Explica lo ocurrido:** si no puedes describirlo sin nombrar decoradores o anotaciones, vuelve al modelo.

Una solución copiada que compila no demuestra comprensión. Poder anticipar un rollback o explicar por qué una petición acaba en 403 sí la demuestra.

## Qué contienen los ejemplos

Cada fragmento lleva una de estas etiquetas:

- **Pseudocódigo:** muestra un orden o una idea; no compila tal cual.
- **Ejemplo de concepto:** usa APIs reales del framework, pero es un fragmento, no una aplicación completa. **No se ha compilado** en esta revisión.
- **Laboratorio:** SQL o comandos pensados para ejecutarse en un entorno desechable. En esta revisión se revisaron por lectura contra la documentación oficial; **no se ejecutaron**. Tu primera tarea en cada laboratorio es ejecutarlos y comparar con el resultado esperado que se indica.

Usa datos sintéticos y bases desechables. No apuntes ningún laboratorio a una base de trabajo.

## Cómo reconocer que aprendiste

Al final deberías poder responder:

- ¿Qué dato representa al usuario aunque cambie de correo?
- ¿Qué transacción protege un refresh y cuándo se confirma?
- ¿Por qué un refresh reutilizado revoca la sesión entera?
- ¿Por qué un guard de rol no demuestra ownership?
- ¿Qué dejas de construir usando Keycloak y qué sigue siendo tuyo?
- ¿Qué aporta un segundo factor que no aporta una contraseña más larga?
- ¿Por qué un enlace de recuperación debe ser de un solo uso y de vida corta?

Si todavía no puedes responderlas, usa los ejercicios para descubrir el punto que falta, no para memorizar nombres de patrones.
