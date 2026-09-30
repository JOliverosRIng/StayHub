import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const SRC = join(__dirname, '..', '..', 'src');

const FORBIDDEN: { pattern: RegExp; reason: string }[] = [
  { pattern: /@auth\//, reason: 'alias de auth-service' },
  { pattern: /@users\//, reason: 'alias de users-service' },
  { pattern: /apps[\\/]auth-service/, reason: 'ruta de auth-service' },
  { pattern: /apps[\\/]users-service/, reason: 'ruta de users-service' },
  { pattern: /@prisma\/client/, reason: 'Prisma es solo de Auth y Users' },
];

const collect = (dir: string): string[] =>
  readdirSync(dir).flatMap((entry) => {
    const full = join(dir, entry);
    return statSync(full).isDirectory() ? collect(full) : full.endsWith('.ts') ? [full] : [];
  });

const sources = collect(SRC).map((file) => ({ file: relative(SRC, file), text: readFileSync(file, 'utf8') }));

describe('Aislamiento del Gateway (Constitucion I y III)', () => {
  it('tiene codigo que analizar', () => {
    expect(sources.length).toBeGreaterThan(0);
  });

  it.each(FORBIDDEN)('no importa $reason desde el codigo del Gateway', ({ pattern, reason }) => {
    const offenders = sources
      .filter(({ text }) => pattern.test(text))
      .map(({ file }) => `${file} (${reason})`);

    expect(offenders).toEqual([]);
  });

  it('no persiste datos de negocio: el Gateway no crea ni toca Prisma', () => {
    const offenders = sources
      .filter(({ text }) => /\bcreateMany\b|\bupsert\b|\bdeleteMany\b|\$queryRaw|\$executeRaw/.test(text))
      .map(({ file }) => file);

    expect(offenders).toEqual([]);
  });
});
