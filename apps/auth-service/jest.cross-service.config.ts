import type { Config } from 'jest';

import { alias } from './jest.config';

const config: Config = {
  displayName: 'cross-service',
  rootDir: '.',
  testEnvironment: 'node',
  testMatch: [
    '<rootDir>/test/contract/users-registration.consumer.spec.ts',
    '<rootDir>/test/contract/users-login-identity.consumer.spec.ts',
    '<rootDir>/test/contract/gateway.provider.spec.ts',
    '<rootDir>/test/integration/cross-service-registration.spec.ts',
    '<rootDir>/test/integration/cross-service-login.spec.ts',
    '<rootDir>/test/integration/gateway-auth.spec.ts',
    '<rootDir>/test/integration/auth-compose.spec.ts',
  ],
  transform: { '^.+\\.tsx?$': ['ts-jest', { tsconfig: '<rootDir>/tsconfig.json' }] },
  moduleNameMapper: alias,
  setupFilesAfterEnv: ['<rootDir>/test/cross-service/setup.ts'],
};

export default config;
