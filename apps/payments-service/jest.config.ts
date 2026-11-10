import type { Config } from 'jest';

const suites = ['unit', 'integration', 'contract', 'security', 'performance'];

const config: Config = {
  rootDir: '.',
  projects: suites.map((name) => ({
    displayName: name,
    rootDir: '.',
    testEnvironment: 'node',
    testMatch: [`<rootDir>/test/${name}/**/*.spec.ts`],
    setupFilesAfterEnv: [`<rootDir>/test/${name}/setup.ts`],
    transform: { '^.+\\.ts$': ['ts-jest', { tsconfig: '<rootDir>/tsconfig.json' }] },
    moduleNameMapper: { '^@payments/(.*)$': '<rootDir>/src/$1' },
    clearMocks: true,
    restoreMocks: true,
  })),
  collectCoverageFrom: ['src/**/*.ts', '!src/main.ts', '!src/**/generated/**', '!src/**/*.d.ts'],
  coverageDirectory: '../../coverage/payments',
  coverageReporters: ['text', 'lcov', 'json-summary'],
  coverageThreshold: {
    global: { statements: 70, branches: 70, functions: 70, lines: 70 },
  },
};

export default config;
