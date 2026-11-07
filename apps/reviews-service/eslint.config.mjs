import eslint from '@eslint/js';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  eslint.configs.recommended,
  ...tseslint.configs.recommendedTypeChecked,
  { ignores: ['node_modules/', 'dist/', 'coverage/', 'src/infrastructure/persistence/generated/**'] },
  {
    files: ['src/**/*.ts', 'test/**/*.ts'],
    languageOptions: { parserOptions: { project: './tsconfig.json', tsconfigRootDir: import.meta.dirname } },
    rules: { '@typescript-eslint/explicit-function-return-type': 'error', '@typescript-eslint/no-explicit-any': 'error' },
  },
  {
    files: ['test/**/*.ts'],
    rules: {
      '@typescript-eslint/explicit-function-return-type': 'off',
      '@typescript-eslint/no-unsafe-assignment': 'off',
      '@typescript-eslint/no-unsafe-call': 'off',
      '@typescript-eslint/no-unsafe-member-access': 'off',
      '@typescript-eslint/require-await': 'off',
    },
  },
  {
    files: ['src/domain/**/*.ts', 'src/application/**/*.ts'],
    rules: {
      'no-restricted-imports': ['error', { patterns: [
        { group: ['@nestjs/*', '@prisma/*', '.prisma/*', 'prisma'], message: 'reviews core cannot depend on NestJS or Prisma.' },
        { group: ['@reviews/infrastructure/*', '@reviews/interfaces/*', '@reviews/modules/*'], message: 'reviews core cannot depend on outer layers.' },
      ] }],
    },
  },
);
