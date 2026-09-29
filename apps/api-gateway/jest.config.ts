import type { Config } from 'jest';

export const alias = {
  '^@gateway/application/(.*)$': '<rootDir>/src/application/$1',
  '^@gateway/infrastructure/(.*)$': '<rootDir>/src/infrastructure/$1',
  '^@gateway/interfaces/(.*)$': '<rootDir>/src/interfaces/$1',
  '^@gateway/modules/(.*)$': '<rootDir>/src/modules/$1',
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

export const projects = [
  'unit',
  'integration',
  'contract',
  'e2e',
  'performance',
  'security',
] as const;

const config: Config = {
  projects: projects.map(project),
  collectCoverageFrom: ['src/**/*.ts', '!src/main.ts'],
  coverageThreshold: {
    global: { branches: 70, functions: 70, lines: 70, statements: 70 },
  },
};

export default config;
