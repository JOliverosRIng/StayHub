import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { execFileSync } from 'node:child_process';

describe('reviews layer boundaries', () => {
  it('keeps domain and application independent of Nest/Prisma/outer layers', () => {
    const root = resolve(__dirname, '../..'); const files = execFileSync('rg', ['--files', 'src/domain', 'src/application'], { cwd: root, encoding: 'utf8' }).trim().split(/\r?\n/u);
    for (const file of files) { const source = readFileSync(resolve(root, file), 'utf8'); expect(source).not.toMatch(/from ['"](?:@nestjs|@prisma|prisma|@reviews\/(?:infrastructure|interfaces|modules))/u); }
  });
});
