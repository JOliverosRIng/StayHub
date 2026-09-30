import eslint from '@eslint/js';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  eslint.configs.recommended,
  ...tseslint.configs.recommendedTypeChecked,
  {
    ignores: ['node_modules/', '**/generated/**', 'dist/', 'build/', 'coverage/', '*.min.js'],
  },
  {
    files: ['apps/users-service/**/*.ts'],
    languageOptions: {
      parserOptions: {
        project: './apps/users-service/tsconfig.json',
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      '@typescript-eslint/explicit-function-return-type': 'error',
      '@typescript-eslint/no-explicit-any': 'error',
    },
  },
  {
    files: [
      'apps/users-service/src/domain/**/*.ts',
      'apps/users-service/src/application/**/*.ts',
    ],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['@nestjs/*', '@prisma/*', '.prisma/*', 'prisma'],
              message: 'domain and application layers must not depend on NestJS or Prisma.',
            },
            {
              group: ['@users/infrastructure/*', '@users/interfaces/*', '@users/modules/*'],
              message: 'domain and application layers must not depend on outer layers.',
            },
          ],
        },
      ],
    },
  },
  {
    files: ['apps/users-service/src/domain/**/*.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['@nestjs/*', '@prisma/*', '.prisma/*', 'prisma'],
              message: 'domain layer must not depend on NestJS or Prisma.',
            },
            {
              group: [
                '@users/application/*',
                '@users/infrastructure/*',
                '@users/interfaces/*',
                '@users/modules/*',
              ],
              message: 'domain layer must not depend on other layers.',
            },
          ],
        },
      ],
    },
  },
);
