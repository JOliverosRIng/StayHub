import { readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

function listTypeScriptFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = resolve(directory, entry.name);
    if (entry.isDirectory()) return listTypeScriptFiles(path);
    return entry.isFile() && entry.name.endsWith('.ts') ? [path] : [];
  });
}

describe('microservice isolation', () => {
  it('does not import code from other StayHub services', () => {
    const root = resolve(__dirname, '../..');
    const files = listTypeScriptFiles(resolve(root, 'src'));

    for (const file of files) {
      expect(readFileSync(file, 'utf8')).not.toMatch(
        /from ['"]@(?:auth|users|search|bookings|gateway)\//u,
      );
    }
  });
});
