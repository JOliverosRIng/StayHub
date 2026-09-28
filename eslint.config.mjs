import eslint from '@eslint/js';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  eslint.configs.recommended,
  ...tseslint.configs.recommendedTypeChecked,
  {
    ignores: ['node_modules/', 'dist/', 'build/', 'coverage/', '*.min.js'],
  },
  {
    files: ['apps/auth-service/**/*.ts'],
    languageOptions: {
      parserOptions: {
        project: './apps/auth-service/tsconfig.json',
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      '@typescript-eslint/explicit-function-return-type': 'error',
      '@typescript-eslint/no-explicit-any': 'error',
    },
  },
);

