import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { execFileSync } from 'node:child_process';

describe('microservice isolation', () => {
  it('does not import code from other StayHub services', () => {
    const root = resolve(__dirname, '../..'); const files = execFileSync('rg', ['--files', 'src'], { cwd: root, encoding: 'utf8' }).trim().split(/\r?\n/u);
    for (const file of files) expect(readFileSync(resolve(root, file), 'utf8')).not.toMatch(/from ['"]@(?:auth|users|search|bookings|gateway)\//u);
  });
});
