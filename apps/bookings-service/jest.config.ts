import type { Config } from 'jest';
const names = ['unit', 'integration', 'contract', 'security', 'concurrency', 'performance', 'e2e'];
const config: Config = {
  rootDir: __dirname,
  projects: names.map((name) => ({
    displayName: name, rootDir: __dirname, testEnvironment: 'node',
    testMatch: [`<rootDir>/test/${name}/**/*.spec.ts`, `<rootDir>/test/${name}/**/*.e2e-spec.ts`],
    setupFilesAfterEnv: [`<rootDir>/test/${name}/setup.ts`],
    transform: { '^.+\\.ts$': ['ts-jest', { tsconfig: '<rootDir>/tsconfig.json' }] },
    moduleNameMapper: {
      '^@bookings/(.*)$': '<rootDir>/src/$1',
      '^@gateway/application/(.*)$': '<rootDir>/../api-gateway/src/application/$1',
      '^@gateway/infrastructure/(.*)$': '<rootDir>/../api-gateway/src/infrastructure/$1',
      '^@gateway/interfaces/(.*)$': '<rootDir>/../api-gateway/src/interfaces/$1',
      '^@gateway/modules/(.*)$': '<rootDir>/../api-gateway/src/modules/$1',
    },
  })),
  collectCoverageFrom: ['src/**/*.ts', '!src/main.ts', '!src/**/generated/**'],
  coverageDirectory: '../../coverage/bookings',
  coverageThreshold: { global: { statements: 70, branches: 70, functions: 70, lines: 70 } },
};
export default config;
