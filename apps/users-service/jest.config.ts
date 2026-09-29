import type { Config } from 'jest';

const alias = {
  '^@users/domain/(.*)$': '<rootDir>/src/domain/$1',
  '^@users/application/(.*)$': '<rootDir>/src/application/$1',
  '^@users/infrastructure/(.*)$': '<rootDir>/src/infrastructure/$1',
  '^@users/interfaces/(.*)$': '<rootDir>/src/interfaces/$1',
  '^@users/modules/(.*)$': '<rootDir>/src/modules/$1',
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
  collectCoverageFrom: ['src/**/*.ts', '!src/main.ts', '!src/**/*.module.ts'],
  coverageThreshold: {
    global: { branches: 70, functions: 70, lines: 70, statements: 70 },
  },
};

export default config;
