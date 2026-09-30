import type { Config } from 'jest';

import { alias } from './jest.config';

// Harness de integración Auth<->Users sin Gateway (task-05). Ejecuta suites
// explícitas contra Auth y Users reales; no usa CROSS_SERVICE_GATEWAY_URL ni el
// stub de Users. Las rutas previstas por task-06/07 quedan enumeradas aquí para
// no depender del descubrimiento de Jest y para excluirlas de las suites aisladas.
const config: Config = {
  displayName: 'auth-users',
  rootDir: '.',
  testEnvironment: 'node',
  testMatch: [
    '<rootDir>/test/integration/auth-users-smoke.spec.ts',
    '<rootDir>/test/contract/users-registration.consumer.spec.ts',
    '<rootDir>/test/contract/users-login-identity.consumer.spec.ts',
    '<rootDir>/test/integration/cross-service-registration.spec.ts',
    '<rootDir>/test/integration/cross-service-login.spec.ts',
    '<rootDir>/test/integration/cross-service-profile.spec.ts',
    '<rootDir>/test/integration/cross-service-recovery.spec.ts',
    '<rootDir>/test/integration/cross-service-reconciliation.spec.ts',
    '<rootDir>/test/integration/cross-service-restart.spec.ts',
  ],
  transform: { '^.+\\.tsx?$': ['ts-jest', { tsconfig: '<rootDir>/tsconfig.json' }] },
  moduleNameMapper: alias,
  setupFilesAfterEnv: ['<rootDir>/test/auth-users/setup.ts'],
};

export default config;
