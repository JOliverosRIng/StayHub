import eslint from '@eslint/js';
import tseslint from 'typescript-eslint';

const outerLayers = [
  '@notifications/infrastructure/*',
  '@notifications/interfaces/*',
  '@notifications/modules/*',
];
const frameworks = ['@nestjs/*', '@prisma/*', '.prisma/*', 'prisma'];

export default tseslint.config(
  eslint.configs.recommended,
  ...tseslint.configs.recommendedTypeChecked,
  { ignores: ['node_modules/', '**/generated/**', 'dist/', 'coverage/', 'scripts/', 'eslint.config.mjs'] },
  {
    files: ['**/*.ts'],
    languageOptions: { parserOptions: { project: './tsconfig.json', tsconfigRootDir: import.meta.dirname } },
    rules: {
      '@typescript-eslint/explicit-function-return-type': 'error',
      '@typescript-eslint/no-explicit-any': 'error',
    },
  },
  {
    files: ['src/application/**/*.ts'],
    rules: {
      'no-restricted-imports': ['error', { patterns: [
        { group: frameworks, message: 'domain and application layers must not depend on NestJS or Prisma.' },
        { group: outerLayers, message: 'domain and application layers must not depend on outer layers.' },
      ] }],
    },
  },
  {
    files: ['src/domain/**/*.ts'],
    rules: {
      'no-restricted-imports': ['error', { patterns: [
        { group: frameworks, message: 'domain layer must not depend on NestJS or Prisma.' },
        { group: ['@notifications/application/*', ...outerLayers], message: 'domain layer must not depend on other layers.' },
      ] }],
    },
  },
);
