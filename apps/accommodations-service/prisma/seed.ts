import { PrismaClient } from '../src/infrastructure/persistence/generated/prisma';
import { FEATURE_CATALOG } from '../src/domain/features/feature-catalog';

/** Idempotently installs the v1 Feature catalog; the migration already seeds it, this restores drifted names. */
export async function seedFeatureCatalog(client: PrismaClient): Promise<void> {
  await client.$transaction(FEATURE_CATALOG.map(({ code, name }) => client.feature.upsert({ where: { code }, create: { code, name }, update: { name } })));
}

if (require.main === module) {
  const client = new PrismaClient();
  seedFeatureCatalog(client)
    .then(() => client.$disconnect())
    .catch(async () => { process.stderr.write('feature catalog seed failed\n'); process.exitCode = 1; await client.$disconnect(); });
}
