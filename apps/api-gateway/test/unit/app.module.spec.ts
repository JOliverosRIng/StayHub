import { Test } from '@nestjs/testing';

import { AppModule } from '../../src/app.module';

describe('AppModule', () => {
  it('compila sin componentes de Auth ni Users', async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();

    expect(moduleRef).toBeDefined();
  });
});
