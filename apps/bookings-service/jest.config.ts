import type { Config } from 'jest';
const names = ['unit', 'integration', 'contract', 'security', 'concurrency', 'performance', 'e2e'];
const config: Config = {
  rootDir: __dirname,
  projects: names.map((name) => ({
    displayName: name, rootDir: __dirname, testEnvironment: 'node',
    testMatch: [`<rootDir>/test/${name}/**/*.spec.ts`],
    setupFilesAfterEnv: [`<rootDir>/test/${name}/setup.ts`],
    transform: { '^.+\\.ts$': ['ts-jest', { tsconfig: '<rootDir>/tsconfig.json' }] },
    moduleNameMapper: { '^@bookings/(.*)$': '<rootDir>/src/$1' },
  })),
  collectCoverageFrom: ['src/**/*.ts', '!src/main.ts', '!src/**/generated/**'],
  coverageDirectory: '../../coverage/bookings',
  coverageThreshold: { global: { statements: 70, branches: 70, functions: 70, lines: 70 } },
};
export default config;
