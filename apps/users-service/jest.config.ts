import type { Config } from 'jest';

const config: Config = {
  rootDir: '.',
  projects: ['unit', 'integration', 'contract', 'security'].map((name) => ({
    displayName: name,
    rootDir: '.',
    testEnvironment: 'node',
    testMatch: [`<rootDir>/test/${name}/**/*.spec.ts`],
    setupFilesAfterEnv: [`<rootDir>/test/${name}/setup.ts`],
    transform: { '^.+\\.ts$': ['ts-jest', { tsconfig: '<rootDir>/tsconfig.json' }] },
    moduleNameMapper: { '^@users/(.*)$': '<rootDir>/src/$1' },
  })),
  collectCoverageFrom: ['src/**/*.ts', '!src/main.ts', '!src/**/generated/**', '!src/**/*.d.ts'],
  coverageDirectory: '../../coverage/users',
  coverageReporters: ['text', 'lcov', 'json-summary'],
  coverageThreshold: { global: { statements: 70, branches: 70, functions: 70, lines: 70 } },
};
export default config;
