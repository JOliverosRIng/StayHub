import { existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const SRC = join(__dirname, '..', '..', 'src');

const LAYERS = ['application', 'infrastructure', 'interfaces', 'modules'] as const;

describe('Estructura de capas del Gateway (Constitucion II, plan.md 3)', () => {
  it('expone exactamente las cuatro capas sin business domain', () => {
    const present = readdirSync(SRC, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name)
      .sort();

    expect(present).toEqual([...LAYERS].sort());
  });

  it('no crea domain/ porque el Gateway no posee dominio de negocio', () => {
    expect(existsSync(join(SRC, 'domain'))).toBe(false);
  });

  it('cada capa existe como directorio real', () => {
    for (const layer of LAYERS) {
      expect(existsSync(join(SRC, layer))).toBe(true);
    }
  });
});
