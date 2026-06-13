// @ts-check
import eslint from '@eslint/js';
import tseslint from 'typescript-eslint';
import globals from 'globals';

// Flat config for the NestJS API. Kept deliberately lenient: this code was
// never linted before, so framework-boundary `any` (decorators, dynamic Prisma
// where-clauses) is allowed and unused vars are warnings, not errors — `eslint`
// only fails the build on genuine errors, keeping `pnpm lint` green while still
// surfacing real problems.
export default tseslint.config(
  {
    ignores: ['dist/**', 'node_modules/**', 'prisma/migrations/**', 'coverage/**'],
  },
  eslint.configs.recommended,
  ...tseslint.configs.recommended,
  {
    languageOptions: {
      globals: { ...globals.node, ...globals.jest },
      parserOptions: { sourceType: 'module' },
    },
    rules: {
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/no-unused-vars': [
        'warn',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_', caughtErrorsIgnorePattern: '^_' },
      ],
      '@typescript-eslint/no-empty-function': 'off',
    },
  },
);
