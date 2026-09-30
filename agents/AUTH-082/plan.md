# AUTH-082 — Verificar imagen, migraciones y Compose de Auth

Estado inicial: pendiente. Tipo: Verificación operativa local; requiere Docker.

## Resultado esperado y evidencia

Dockerfile copia node_modules completo y asume dist/main.js; Compose no publica puertos, pero build/arranque y readiness no se han ejecutado. PRE-001 verifica el riesgo de aliases.

## Preparación

Leer [reglas compartidas](../decisiones.md): D01, D08, D09, y [auditoría](../auditoria.md). Ejecutar desde la raíz del repositorio.

Dependencias: [AUTH-074](../AUTH-074/plan.md).

## Archivos concretos

- `apps/auth-service/test/integration/auth-compose.spec.ts`
- `infra/docker/auth/Dockerfile`
- `docker-compose.yml`
- `apps/auth-service/src/infrastructure/persistence/prisma/prisma.service.ts`
- `.github/workflows/ci.yml`
- `apps/auth-service/README.md`

## Pasos de ejecución

1. Crear harness con nombre único de proyecto Compose y env test temporal con RSA real efímero, secretos sintéticos y URLs internas; no usar placeholders PEM de .env.example como claves válidas.
2. Construir imagen multi-stage y ejecutar node dist/main.js dentro del runtime. Verificar resolución de aliases, Prisma generado y biblioteca nativa argon2; corregir si PRE-001 no pudo probarlo.
3. Verificar UID no root, puerto interno3001, ninguna publicación de Auth/DB/Redis al host, restart:always y dependencias por health/migrate. Consultar health mediante exec dentro de red.
4. Arranque desde volumen test vacío aplica001–004 antes de ready 200. Omitir/romper última migración en fixture →readiness 503, no count>=2 falso positivo. Redis/DB caídos afectan ready; live sigue vivo si proceso funciona.
5. Reinicio conserva datos; shutdown no deja workers/clientes. OTLP ausente no debe bloquear readiness si no es dependencia de tráfico; describir su manejo seguro.
6. Añadir ejecución de harness/imagen en CI donde Docker disponible y filtros de archivos relevantes. Limpiar únicamente recursos del proyecto test creado, con try/finally; registrar exactamente nombre y resultados.

## Criterios de aceptación

- [ ] La imagen arranca realmente; no basta que docker build termine.
- [ ] Migración precede tráfico y readiness detecta schema incompleto.
- [ ] No hay secretos versionados ni servicios internos publicados.

## Comprobación

```sh
docker build --target runtime -f infra/docker/auth/Dockerfile .
npm run test:cross-service --workspace @stayhub/auth-service -- --selectProjects integration --runTestsByPath test/integration/auth-compose.spec.ts
```

Si Docker falta, crear harness/documentación y declarar ejecución pendiente. No instalar daemon ni tocar volúmenes existentes sin autorización aplicable.

Al terminar, crear `agents/AUTH-082/resultado.md` con cambios, pruebas y bloqueos. No declarar como ejecutada una prueba pendiente de infraestructura. El estado del plan solo cambia cuando sus criterios se verifican.
