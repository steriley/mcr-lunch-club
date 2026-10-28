import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import pluginVue from 'eslint-plugin-vue';
import pluginAstro from 'eslint-plugin-astro';
import prettier from 'eslint-config-prettier';
import globals from 'globals';

export default tseslint.config(
  {
    ignores: [
      '.astro/**',
      '.vercel/**',
      'dist/**',
      'node_modules/**',
      'drizzle/**',
      'playwright-report/**',
      'test-results/**',
      'public/**',
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  ...pluginVue.configs['flat/recommended'],
  ...pluginAstro.configs.recommended,
  {
    files: ['**/*.vue'],
    languageOptions: { parserOptions: { parser: tseslint.parser } },
  },
  {
    languageOptions: { globals: { ...globals.node, ...globals.browser } },
    rules: {
      // Style-only Vue rules; the existing components don't follow them.
      'vue/attributes-order': 'off',
      'vue/require-default-prop': 'off',
      // Leaflet and the map helpers lean on `any`; flag new uses without failing CI.
      '@typescript-eslint/no-explicit-any': 'warn',
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_', caughtErrorsIgnorePattern: '^_' },
      ],
    },
  },
  {
    files: ['**/*.vue'],
    rules: { 'vue/multi-word-component-names': ['error', { ignores: ['Icon'] }] },
  },
  // Type-aware rules for async code (database, auth, fetch). Only the promise-safety rules are on:
  // the full type-checked preset's `no-unsafe-*` rules would drown in the existing Leaflet `any`s.
  {
    files: ['**/*.ts', '**/*.vue'],
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
        extraFileExtensions: ['.vue'],
      },
    },
    rules: {
      '@typescript-eslint/no-floating-promises': 'error',
      '@typescript-eslint/no-misused-promises': 'error',
      '@typescript-eslint/await-thenable': 'error',
      '@typescript-eslint/no-for-in-array': 'error',
      '@typescript-eslint/only-throw-error': 'error',
    },
  },
  // Tests stub browser and Leaflet globals, so `any` is fine there, and node:test's
  // describe/it return promises that are meant to be left to the runner.
  {
    files: ['**/*.test.ts', 'src/test/**', 'e2e/**'],
    rules: {
      '@typescript-eslint/no-floating-promises': 'off',
      '@typescript-eslint/only-throw-error': 'off',
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/no-unsafe-function-type': 'off',
    },
  },
  // Turns off every stylistic rule that would fight Prettier. Keep last.
  prettier
);
