import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import hooks from 'eslint-plugin-react-hooks';
export default tseslint.config(js.configs.recommended, ...tseslint.configs.recommended, {
  files: ['src/**/*.{ts,tsx}'],
  languageOptions: { globals: { window: 'readonly', document: 'readonly', navigator: 'readonly', localStorage: 'readonly', fetch: 'readonly', crypto: 'readonly', setTimeout: 'readonly', clearTimeout: 'readonly', console: 'readonly', AbortSignal: 'readonly', BroadcastChannel: 'readonly' } },
  plugins: { 'react-hooks': hooks }, rules: { ...hooks.configs.recommended.rules },
});
