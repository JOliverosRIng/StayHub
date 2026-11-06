import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const sourceRoot = join(process.cwd(), 'src');
function files(root: string): string[] {
  return readdirSync(root).flatMap((entry) => {
    const path = join(root, entry);
    return statSync(path).isDirectory() ? files(path) : path.endsWith('.ts') ? [path] : [];
  });
}
function imports(path: string): string[] {
  return [...readFileSync(path, 'utf8').matchAll(/(?:from\s+|import\s*)["']([^"']+)["']/gu)].map((match) => match[1]!);
}

describe('Search layer boundaries', () => {
  it.each(['domain', 'application'])('%s does not depend on infrastructure, interfaces or modules', (layer) => {
    const violations = files(join(sourceRoot, layer)).flatMap((path) => imports(path)
      .filter((dependency) => /@search\/(?:infrastructure|interfaces|modules)\//u.test(dependency))
      .map((dependency) => `${relative(sourceRoot, path)} -> ${dependency}`));
    expect(violations).toEqual([]);
  });

  it('domain remains framework and persistence independent', () => {
    const violations = files(join(sourceRoot, 'domain')).flatMap((path) => imports(path)
      .filter((dependency) => /^(?:@nestjs|@prisma|ioredis|amqplib)/u.test(dependency))
      .map((dependency) => `${relative(sourceRoot, path)} -> ${dependency}`));
    expect(violations).toEqual([]);
  });

  it('has no imports into Auth, Users, Gateway or sibling application sources', () => {
    const violations = files(sourceRoot).flatMap((path) => imports(path)
      .filter((dependency) => /(?:@(?:auth|users|gateway)\/|apps\/(?:auth|users|gateway)|\.\.\/\.\.\/(?:auth|users|gateway))/iu.test(dependency))
      .map((dependency) => `${relative(sourceRoot, path)} -> ${dependency}`));
    expect(violations).toEqual([]);
  });

  it('uses only the Search database contract', () => {
    const schemaPath = join(process.cwd(), 'prisma/schema.prisma');
    const paths = [schemaPath, ...files(sourceRoot)];
    const violations = paths.filter((path) => /(?:AUTH|USERS|GATEWAY|BOOKINGS|ACCOMMODATIONS)_DATABASE_URL|\b(?:auth|users|gateway|bookings|accommodations)_db\b/iu.test(readFileSync(path, 'utf8')));
    expect(violations.map((path) => relative(process.cwd(), path))).toEqual([]);
    expect(readFileSync(schemaPath, 'utf8')).toContain('env("SEARCH_DATABASE_URL")');
  });
});
