# Fallo USR-048: foto de 5.000.000 bytes responde 503 (Prisma P2028)

Para: Persona B (Grupo 2, users-service)

## Commit probado

- Rama: `origin/feat/users-perfil-authz`
- Commit: `66134ce3755a477a799f9773ed7ef0d570369a98` — "docs(users): record final revalidation results"
- Entorno: Windows 11, Docker Desktop 29.5.2, PostgreSQL 16 (`postgres:16-alpine`) en `127.0.0.1:55432`, Node v22.16.0, Prisma 6.19.0
- Comando (desde `apps/users-service`, tras `npm ci` y `npm run prisma:users:generate`):

```text
USERS_TEST_DATABASE_URL=postgresql://users:***@127.0.0.1:55432/users_db
npx jest --runInBand --runTestsByPath test/integration/profile-photo.spec.ts --verbose
```

## Resultado

- `accepts magic bytes with exact 5,000,000 byte boundary` (PNG y JPEG): **fallan**, `expected 200 "OK", got 503 "Service Unavailable"`.
- Las otras 4 pruebas de la suite pasan.

## Causa

`src/infrastructure/persistence/prisma/profile.repository.ts`, método `update`:

1. La transacción interactiva (línea 23, `this.prisma.$transaction(async (tx) => { ... })`) no define `timeout`, así que usa el de Prisma: 5000 ms.
2. El `tx.profilePhoto.upsert()` de 5 MB (línea 34) tarda más: 6314 ms y 6503 ms en esta máquina. Prisma cierra la transacción y lanza `P2028`.
3. El `catch` convierte todo error distinto de `P2002` en `DomainError('UNAVAILABLE')` y la API responde 503 sin registrar la causa en ningún log.

Usar `127.0.0.1` en lugar de `localhost` (lo que indica `validation-report.md` para USR-047 / P2028) no evita el fallo: depende de la velocidad de la máquina, no del host.

## Arreglo sugerido

- Dar a esa transacción un `timeout` explícito con margen, por ejemplo `{ timeout: 15_000 }` como segundo argumento de `$transaction`.
- Registrar el error original (sin datos sensibles) antes de convertirlo en `UNAVAILABLE`, para que un 503 pueda diagnosticarse.

## Log completo

La primera ejecución es la suite sin cambios. La segunda usa un `console.error('[DIAG profile.update]', error)` temporal en el `catch` para mostrar el error original de Prisma; ese cambio se hizo en una copia desechable y no está en ninguna rama.

```text
commit: 66134ce3755a477a799f9773ed7ef0d570369a98 (origin/feat/users-perfil-authz)
fecha: 2026-09-29T16:00:58.0775624-05:00
node: v22.16.0
USERS_TEST_DATABASE_URL=postgresql://users:***@127.0.0.1:55432/users_db
comando: npx jest --runInBand --runTestsByPath test/integration/profile-photo.spec.ts --verbose

FAIL integration test/integration/profile-photo.spec.ts (85.254 s)
  USR-048 photo boundaries and rollback
    × accepts magic bytes with exact 5,000,000 byte boundary (14134 ms)
    × accepts magic bytes with exact 5,000,000 byte boundary (6489 ms)
    √ rejects invalid photo with rollback (128 ms)
    √ rejects invalid photo with rollback (52 ms)
    √ rejects invalid photo with rollback (47 ms)
    √ deletes with null and rejects file plus null (178 ms)

  ● USR-048 photo boundaries and rollback › accepts magic bytes with exact 5,000,000 byte boundary

    expected 200 "OK", got 503 "Service Unavailable"

       7 |   it.each([[png, 'image/png'], [jpeg, 'image/jpeg']] as const)('accepts magic bytes with exact 5,000,000 byte boundary', async (signature, type) => {
       8 |     const id = await activeFixture(h); const content = Buffer.alloc(5_000_000); signature.copy(content);
    >  9 |     await request(h.server).patch(`/internal/v1/users/${id}/profile`).set('Authorization', `Bearer ${userToken(id)}`).field('profile', JSON.stringify({ expectedVersion: 1 })).attach('photo', content, { filename: 'discard', contentType: type }).expect(200);
         |                                                                                                                                                                                                                                                     ^
      10 |   });
      11 |   it.each([[Buffer.alloc(5_000_001), 'image/png', 413], [Buffer.from('not an image'), 'image/png', 415], [png, 'image/jpeg', 415]] as const)('rejects invalid photo with rollback', async (content, type, status) => {
      12 |     const id = await activeFixture(h); const before = await h.db.user.findUniqueOrThrow({ where: { id } });

      at test/integration/profile-photo.spec.ts:9:245
      ----
      at Test._assertStatus (../../node_modules/supertest/lib/test.js:252:14)
      at ../../node_modules/supertest/lib/test.js:308:13
      at Test._assertFunction (../../node_modules/supertest/lib/test.js:285:13)
      at Test.assert (../../node_modules/supertest/lib/test.js:164:23)
      at Server.localAssert (../../node_modules/supertest/lib/test.js:120:14)

  ● USR-048 photo boundaries and rollback › accepts magic bytes with exact 5,000,000 byte boundary

    expected 200 "OK", got 503 "Service Unavailable"

       7 |   it.each([[png, 'image/png'], [jpeg, 'image/jpeg']] as const)('accepts magic bytes with exact 5,000,000 byte boundary', async (signature, type) => {
       8 |     const id = await activeFixture(h); const content = Buffer.alloc(5_000_000); signature.copy(content);
    >  9 |     await request(h.server).patch(`/internal/v1/users/${id}/profile`).set('Authorization', `Bearer ${userToken(id)}`).field('profile', JSON.stringify({ expectedVersion: 1 })).attach('photo', content, { filename: 'discard', contentType: type }).expect(200);
         |                                                                                                                                                                                                                                                     ^
      10 |   });
      11 |   it.each([[Buffer.alloc(5_000_001), 'image/png', 413], [Buffer.from('not an image'), 'image/png', 415], [png, 'image/jpeg', 415]] as const)('rejects invalid photo with rollback', async (content, type, status) => {
      12 |     const id = await activeFixture(h); const before = await h.db.user.findUniqueOrThrow({ where: { id } });

      at test/integration/profile-photo.spec.ts:9:245
      ----
      at Test._assertStatus (../../node_modules/supertest/lib/test.js:252:14)
      at ../../node_modules/supertest/lib/test.js:308:13
      at Test._assertFunction (../../node_modules/supertest/lib/test.js:285:13)
      at Test.assert (../../node_modules/supertest/lib/test.js:164:23)
      at Server.localAssert (../../node_modules/supertest/lib/test.js:120:14)

Test Suites: 1 failed, 1 total
Tests:       2 failed, 4 passed, 6 total
Snapshots:   0 total
Time:        85.739 s
Ran all test suites within paths "test/integration/profile-photo.spec.ts".

==================== DIAGNÓSTICO: error original de Prisma (console.error temporal en el catch de profile.repository.ts, solo en worktree desechable) ====================

  console.error
    [DIAG profile.update] PrismaClientKnownRequestError: 
    Invalid `tx.profilePhoto.upsert()` invocation in
    <repo>\apps\users-service\src\infrastructure\persistence\prisma\profile.repository.ts:34:110
    
      31   const exists = await tx.user.findFirst({ where: { id, status: 'ACTIVE' }, select: { id: true } });
      32   throw new DomainError(exists ? 'VERSION_CONFLICT' : 'NOT_FOUND');
      33 }
    → 34 if (photo) { const record = { ...photo, content: Buffer.from(photo.content) }; await tx.profilePhoto.upsert(
    Transaction API error: Transaction already closed: A query cannot be executed on an expired transaction. The timeout for this transaction was 5000 ms, however 6314 ms passed since the start of the transaction. Consider increasing the interactive transaction timeout or doing less work in the transaction.
        at ei.handleRequestError (<repo>\apps\users-service\src\infrastructure\persistence\generated\prisma\runtime\library.js:125:7268)
        at ei.handleAndLogRequestError (<repo>\apps\users-service\src\infrastructure\persistence\generated\prisma\runtime\library.js:125:6593)
        at ei.request (<repo>\apps\users-service\src\infrastructure\persistence\generated\prisma\runtime\library.js:125:6300)
        at async a (<repo>\apps\users-service\src\infrastructure\persistence\generated\prisma\runtime\library.js:134:9551)
        at async <repo>\apps\users-service\src\infrastructure\persistence\prisma\profile.repository.ts:34:88
        at async Proxy._transactionWithCallback (<repo>\apps\users-service\src\infrastructure\persistence\generated\prisma\runtime\library.js:134:8120)
        at async PrismaProfileRepository.update (<repo>\apps\users-service\src\infrastructure\persistence\prisma\profile.repository.ts:23:14) {
      code: 'P2028',
      meta: {
        modelName: 'ProfilePhoto',
        error: 'Transaction already closed: A query cannot be executed on an expired transaction. The timeout for this transaction was 5000 ms, however 6314 ms passed since the start of the transaction. Consider increasing the interactive transaction timeout or doing less work in the transaction.'
      },
      clientVersion: '6.19.0'
    }

      38 |     } catch (error) {
      39 |       if (error instanceof DomainError) throw error;
    > 40 |       console.error('[DIAG profile.update]', error);
         |               ^
      41 |       if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') throw new DomainError('EMAIL_CONFLICT');
      42 |       throw new DomainError('UNAVAILABLE');
      43 |     }

      at PrismaProfileRepository.update (src/infrastructure/persistence/prisma/profile.repository.ts:40:15)

  console.error
    [DIAG profile.update] PrismaClientKnownRequestError: 
    Invalid `tx.profilePhoto.upsert()` invocation in
    <repo>\apps\users-service\src\infrastructure\persistence\prisma\profile.repository.ts:34:110
    
      31   const exists = await tx.user.findFirst({ where: { id, status: 'ACTIVE' }, select: { id: true } });
      32   throw new DomainError(exists ? 'VERSION_CONFLICT' : 'NOT_FOUND');
      33 }
    → 34 if (photo) { const record = { ...photo, content: Buffer.from(photo.content) }; await tx.profilePhoto.upsert(
    Transaction API error: Transaction already closed: A query cannot be executed on an expired transaction. The timeout for this transaction was 5000 ms, however 6503 ms passed since the start of the transaction. Consider increasing the interactive transaction timeout or doing less work in the transaction.
        at ei.handleRequestError (<repo>\apps\users-service\src\infrastructure\persistence\generated\prisma\runtime\library.js:125:7268)
        at ei.handleAndLogRequestError (<repo>\apps\users-service\src\infrastructure\persistence\generated\prisma\runtime\library.js:125:6593)
        at ei.request (<repo>\apps\users-service\src\infrastructure\persistence\generated\prisma\runtime\library.js:125:6300)
        at async a (<repo>\apps\users-service\src\infrastructure\persistence\generated\prisma\runtime\library.js:134:9551)
        at async <repo>\apps\users-service\src\infrastructure\persistence\prisma\profile.repository.ts:34:88
        at async Proxy._transactionWithCallback (<repo>\apps\users-service\src\infrastructure\persistence\generated\prisma\runtime\library.js:134:8120)
        at async PrismaProfileRepository.update (<repo>\apps\users-service\src\infrastructure\persistence\prisma\profile.repository.ts:23:14) {
      code: 'P2028',
      meta: {
        modelName: 'ProfilePhoto',
        error: 'Transaction already closed: A query cannot be executed on an expired transaction. The timeout for this transaction was 5000 ms, however 6503 ms passed since the start of the transaction. Consider increasing the interactive transaction timeout or doing less work in the transaction.'
      },
      clientVersion: '6.19.0'
    }

      38 |     } catch (error) {
      39 |       if (error instanceof DomainError) throw error;
    > 40 |       console.error('[DIAG profile.update]', error);
         |               ^
      41 |       if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') throw new DomainError('EMAIL_CONFLICT');
      42 |       throw new DomainError('UNAVAILABLE');
      43 |     }

      at PrismaProfileRepository.update (src/infrastructure/persistence/prisma/profile.repository.ts:40:15)

FAIL integration test/integration/profile-photo.spec.ts (39.091 s)
  USR-048 photo boundaries and rollback
    × accepts magic bytes with exact 5,000,000 byte boundary (6676 ms)
    × accepts magic bytes with exact 5,000,000 byte boundary (6761 ms)
    ○ skipped rejects invalid photo with rollback
    ○ skipped rejects invalid photo with rollback
    ○ skipped rejects invalid photo with rollback
    ○ skipped deletes with null and rejects file plus null

  ● USR-048 photo boundaries and rollback › accepts magic bytes with exact 5,000,000 byte boundary

    expected 200 "OK", got 503 "Service Unavailable"

       7 |   it.each([[png, 'image/png'], [jpeg, 'image/jpeg']] as const)('accepts magic bytes with exact 5,000,000 byte boundary', async (signature, type) => {
       8 |     const id = await activeFixture(h); const content = Buffer.alloc(5_000_000); signature.copy(content);
    >  9 |     await request(h.server).patch(`/internal/v1/users/${id}/profile`).set('Authorization', `Bearer ${userToken(id)}`).field('profile', JSON.stringify({ expectedVersion: 1 })).attach('photo', content, { filename: 'discard', contentType: type }).expect(200);
         |                                                                                                                                                                                                                                                     ^
      10 |   });
      11 |   it.each([[Buffer.alloc(5_000_001), 'image/png', 413], [Buffer.from('not an image'), 'image/png', 415], [png, 'image/jpeg', 415]] as const)('rejects invalid photo with rollback', async (content, type, status) => {
      12 |     const id = await activeFixture(h); const before = await h.db.user.findUniqueOrThrow({ where: { id } });

      at test/integration/profile-photo.spec.ts:9:245
      ----
      at Test._assertStatus (../../node_modules/supertest/lib/test.js:252:14)
      at ../../node_modules/supertest/lib/test.js:308:13
      at Test._assertFunction (../../node_modules/supertest/lib/test.js:285:13)
      at Test.assert (../../node_modules/supertest/lib/test.js:164:23)
      at Server.localAssert (../../node_modules/supertest/lib/test.js:120:14)

  ● USR-048 photo boundaries and rollback › accepts magic bytes with exact 5,000,000 byte boundary

    expected 200 "OK", got 503 "Service Unavailable"

       7 |   it.each([[png, 'image/png'], [jpeg, 'image/jpeg']] as const)('accepts magic bytes with exact 5,000,000 byte boundary', async (signature, type) => {
       8 |     const id = await activeFixture(h); const content = Buffer.alloc(5_000_000); signature.copy(content);
    >  9 |     await request(h.server).patch(`/internal/v1/users/${id}/profile`).set('Authorization', `Bearer ${userToken(id)}`).field('profile', JSON.stringify({ expectedVersion: 1 })).attach('photo', content, { filename: 'discard', contentType: type }).expect(200);
         |                                                                                                                                                                                                                                                     ^
      10 |   });
      11 |   it.each([[Buffer.alloc(5_000_001), 'image/png', 413], [Buffer.from('not an image'), 'image/png', 415], [png, 'image/jpeg', 415]] as const)('rejects invalid photo with rollback', async (content, type, status) => {
      12 |     const id = await activeFixture(h); const before = await h.db.user.findUniqueOrThrow({ where: { id } });

      at test/integration/profile-photo.spec.ts:9:245
      ----
      at Test._assertStatus (../../node_modules/supertest/lib/test.js:252:14)
      at ../../node_modules/supertest/lib/test.js:308:13
      at Test._assertFunction (../../node_modules/supertest/lib/test.js:285:13)
      at Test.assert (../../node_modules/supertest/lib/test.js:164:23)
      at Server.localAssert (../../node_modules/supertest/lib/test.js:120:14)

Test Suites: 1 failed, 1 total
Tests:       2 failed, 4 skipped, 6 total
Snapshots:   0 total
Time:        39.588 s, estimated 86 s
Ran all test suites within paths "test/integration/profile-photo.spec.ts".
```
