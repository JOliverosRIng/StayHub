import { readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

function listTypeScriptFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = resolve(directory, entry.name);
    if (entry.isDirectory()) return listTypeScriptFiles(path);
    return entry.isFile() && entry.name.endsWith('.ts') ? [path] : [];
  });
}

describe('reviews layer boundaries', () => {
  it('keeps domain and application independent of Nest/Prisma/outer layers', () => {
    const root = resolve(__dirname, '../..');
    const files = [
      ...listTypeScriptFiles(resolve(root, 'src/domain')),
      ...listTypeScriptFiles(resolve(root, 'src/application')),
    ];

    for (const file of files) {
      const source = readFileSync(file, 'utf8');
      expect(source).not.toMatch(
        /from ['"](?:@nestjs|@prisma|prisma|@reviews\/(?:infrastructure|interfaces|modules))/u,
      );
    }
  });
});
