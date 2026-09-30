# Aprender a construir autenticación e identidad

Esta guía está pensada para que puedas reconstruir el razonamiento y escribir el sistema tú mismo, consultando documentación y experimentando. StayHub es el caso de estudio; NestJS y Spring son dos formas de implementar las mismas decisiones.

La dificultad que estás viendo tiene una causa: el proyecto no solo verifica contraseñas. También promete registro consistente entre dos bases, reintentos seguros, recuperación después de caídas y revocación bajo concurrencia. Cada promesa añade trabajo comprobable.

No necesitas dominarlo todo para empezar. Primero construye un sistema pequeño que entiendas. Después introduce una dificultad y observa qué se rompe.

## Por dónde empezar

| Lectura | Qué aprenderás | Cuándo leerla |
|---|---|---|
| [1. Fundamentos](01-fundamentos.md) | Identidad, sesiones, contraseñas, JWT, OAuth/OIDC y confianza | Primero |
| [2. Patrones y decisiones](02-patrones-y-decisiones.md) | Qué problema resuelve cada patrón y cuándo sobra | Después de fundamentos |
| [Recorrido NestJS](nest/README.md) | Construcción gradual con TypeScript, Nest, Prisma y pruebas | Si vas a continuar StayHub |
| [Recorrido Spring](spring/README.md) | El mismo aprendizaje con Java, Spring Security y transacciones | Como alternativa o segunda implementación |
| [3. Laboratorio de fallos](03-laboratorio-transacciones-y-fallos.md) | SQL concurrente, replay, rollback, leases y fallos de red | Antes de implementar refresh y saga |
| [4. Keycloak y alternativas](04-keycloak-y-alternativas.md) | Elegir entre construir, integrar y operar identidad | Antes de decidir una arquitectura propia |
| [5. Ejercicios y autoevaluación](05-ejercicios-y-autoevaluacion.md) | Practicar sin IA y comprobar comprensión | A lo largo de todo el recorrido |
| [6. Fuentes y versiones](06-fuentes-y-versiones.md) | Documentación oficial y compatibilidad de los ejemplos | Al preparar cada laboratorio |

## Ruta sugerida

1. Lee fundamentos y dibuja registro, login y petición protegida en papel.
2. Elige **un** framework. Implementa en un proyecto de laboratorio separado de StayHub.
3. Construye registro y login en un único proceso y una base, con sesión opaca.
4. Añade JWT y compara qué cambió. Conserva el experimento anterior.
5. Implementa refresh rotatorio y rompe su concurrencia a propósito.
6. Separa Users y Auth. Ahora justifica saga, idempotencia y reconciliación.
7. Integra Keycloak en otro experimento y compara las responsabilidades que desaparecen y las que permanecen.
8. Repite una pequeña parte con el segundo framework. Si comprendes la idea, podrás traducirla.

La sesión opaca, el monolito y Keycloak son **alternativas didácticas**, no cambios aprobados al alcance de StayHub. La implementación actual del proyecto continúa regida por su especificación.

## Cómo estudiar cada unidad sin IA

Usa bloques de trabajo manejables; las duraciones dependen de tu experiencia.

1. **Antes de programar:** escribe entrada, salida, reglas que siempre deben cumplirse y tres errores posibles.
2. **Lee lo mínimo necesario:** una sección de documentación oficial relacionada con el problema.
3. **Implementa una parte observable:** por ejemplo, rechazar una contraseña incorrecta sin crear una sesión.
4. **Predice y prueba:** anota el resultado esperado antes de ejecutar.
5. **Provoca un fallo:** timeout, dos peticiones simultáneas, token vencido.
6. **Explica lo ocurrido:** si no puedes describirlo sin mencionar decoradores, vuelve al modelo.
7. **Escribe una bitácora:** decisión, motivo, prueba y duda pendiente.

Una solución copiada que compila no demuestra comprensión. Poder anticipar un rollback o explicar por qué una petición acaba en 403 sí la demuestra.

## Qué contienen los ejemplos

Los fragmentos están etiquetados como **ejemplo de concepto**, **pseudocódigo** o **laboratorio ejecutable**. Los fragmentos de frameworks no son aplicaciones completas ni se han compilado como proyectos independientes en esta entrega. Incluyen contexto y ejercicios para que construyas y verifiques las piezas que faltan.

Los laboratorios usan datos sintéticos y bases desechables. No se ejecutaron contra tu aplicación ni modifican sus migraciones.

## Relación con el repositorio

- [Especificación de identidad](../specs/001-fundamentos-identidad/spec.md): lo que el producto promete.
- [Modelo de datos](../specs/001-fundamentos-identidad/data-model.md): estados e invariantes.
- [Planes ejecutables](../agents/README.md): distribución de tareas.
- [Memoria de ejecución](../agents/result/README.md): avances reportados por otras sesiones; consulta su evidencia antes de asumir que una pieza está terminada.

Al redactar esta guía ya existen CoreModule, ServiceAuthModule y puertos de trabajo transaccional, además de migraciones y pruebas añadidas durante el desarrollo. Los enlaces a código sirven para estudiar implementaciones; no certifican que el sistema completo esté terminado.

## Cómo reconocer que aprendiste

Al final deberías poder responder:

- ¿Qué dato representa al usuario aunque cambie de correo?
- ¿Qué transacción protege un refresh y cuándo se confirma?
- ¿Qué puedes concluir después de un timeout?
- ¿Por qué un guard de rol no demuestra ownership?
- ¿Qué dejas de construir usando Keycloak?
- ¿Qué requisito te obliga realmente a usar dos servicios?

Si todavía no puedes responderlas, usa los ejercicios para descubrir el punto que falta, no para memorizar nombres de patrones.
