import type { Config } from 'jest';

const alias = {
  '^@auth/domain/(.*)$': '<rootDir>/src/domain/$1',
  '^@auth/application/(.*)$': '<rootDir>/src/application/$1',
  '^@auth/infrastructure/(.*)$': '<rootDir>/src/infrastructure/$1',
  '^@auth/interfaces/(.*)$': '<rootDir>/src/interfaces/$1',
  '^@auth/modules/(.*)$': '<rootDir>/src/modules/$1',
};

const project = (name: string): Config => ({
  displayName: name,
  rootDir: '.',
  testEnvironment: 'node',
  testMatch: [`<rootDir>/test/${name}/**/*.spec.ts`],
  transform: { '^.+\\.tsx?$': ['ts-jest', { tsconfig: '<rootDir>/tsconfig.json' }] },
  moduleNameMapper: alias,
  setupFilesAfterEnv: [`<rootDir>/test/${name}/setup.ts`],
});

const config: Config = {
  projects: ['unit', 'integration', 'contract', 'security'].map(project),
  collectCoverageFrom: ['src/**/*.ts', '!src/main.ts'],
  coverageThreshold: {
    global: { branches: 70, functions: 70, lines: 70, statements: 70 },
  },
};

export default config;

