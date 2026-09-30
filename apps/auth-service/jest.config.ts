import type { Config } from 'jest';

export const alias = {
  '^@auth/domain/(.*)$': '<rootDir>/src/domain/$1',
  '^@auth/application/(.*)$': '<rootDir>/src/application/$1',
  '^@auth/infrastructure/(.*)$': '<rootDir>/src/infrastructure/$1',
  '^@auth/interfaces/(.*)$': '<rootDir>/src/interfaces/$1',
  '^@auth/modules/(.*)$': '<rootDir>/src/modules/$1',
};

const crossServicePatterns = [
  'users-registration.consumer.spec.ts',
  'users-login-identity.consumer.spec.ts',
  'gateway.provider.spec.ts',
  'cross-service-registration.spec.ts',
  'cross-service-login.spec.ts',
  'cross-service-profile.spec.ts',
  'cross-service-recovery.spec.ts',
  'cross-service-reconciliation.spec.ts',
  'cross-service-restart.spec.ts',
  'gateway-auth.spec.ts',
  'auth-compose.spec.ts',
  'auth-users-smoke.spec.ts',
];

const project = (name: string, testPathIgnorePatterns: string[] = []): Config => ({
  displayName: name,
  rootDir: '.',
  testEnvironment: 'node',
  testMatch: [`<rootDir>/test/${name}/**/*.spec.ts`],
  testPathIgnorePatterns,
  transform: { '^.+\\.tsx?$': ['ts-jest', { tsconfig: '<rootDir>/tsconfig.json' }] },
  moduleNameMapper: alias,
  setupFilesAfterEnv: [`<rootDir>/test/${name}/setup.ts`],
});

const config: Config = {
  projects: [
    project('unit'),
    project('integration', crossServicePatterns),
    project('contract', crossServicePatterns),
    project('security'),
  ],
  collectCoverageFrom: ['src/**/*.ts', '!src/main.ts'],
  coverageThreshold: {
    global: { branches: 70, functions: 70, lines: 70, statements: 70 },
  },
};

export default config;
