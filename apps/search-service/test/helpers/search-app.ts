import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { AppModule } from '../../src/app.module';
import { ProblemFilter } from '../../src/interfaces/http/problem.filter';
import { createSearchValidationPipe } from '../../src/interfaces/http/validation.pipe';
export async function createSearchTestApp(): Promise<INestApplication> {
  const module = await Test.createTestingModule({ imports: [AppModule] }).compile();
  const app = module.createNestApplication(); app.useGlobalFilters(new ProblemFilter()); app.useGlobalPipes(createSearchValidationPipe()); await app.init(); return app;
}
