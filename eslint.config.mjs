// Root ESLint flat config: every workspace's `eslint src` resolves to this file.
// TypeScript-aware recommended rules, no type-checked rules (they need a
// tsconfig per run and are slow); Prettier owns formatting.
import js from '@eslint/js';
import next from '@next/eslint-plugin-next';
import reactHooks from 'eslint-plugin-react-hooks';
import globals from 'globals';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  {
    ignores: [
      '**/node_modules/**',
      '**/dist/**',
      '**/.next/**',
      '**/.expo/**',
      '**/.turbo/**',
      '**/coverage/**',
      '**/generated/**',
      '**/next-env.d.ts',
      'apps/api/.local/**',
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    // Only the two classic hook rules; the React Compiler rules (refs in render, setState in
    // effects) would rewrite half the screens for no runtime gain.
    plugins: { 'react-hooks': reactHooks },
    rules: { 'react-hooks/rules-of-hooks': 'error', 'react-hooks/exhaustive-deps': 'warn' },
  },
  {
    // The two Next apps: their own rules (no <img>, etc.) only under apps/web and apps/admin.
    ...next.configs.recommended,
    files: ['apps/web/**', 'apps/admin/**'],
  },
  {
    languageOptions: {
      globals: { ...globals.browser, ...globals.node, ...globals.es2022 },
    },
    rules: {
      // `_x` marks a deliberately unused binding; a caught error may stay unnamed.
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_', caughtErrors: 'none' },
      ],
      // Fastify plugins and RN modules still take `require`; the boundary DTOs use `any` in places.
      '@typescript-eslint/no-require-imports': 'off',
      '@typescript-eslint/no-explicit-any': 'off',
      // Empty catch blocks are the "ignore this" idiom throughout.
      'no-empty': ['error', { allowEmptyCatch: true }],
      // `let x = null; try { x = … }` is how the fetch wrappers read: the null is the failure value.
      'no-useless-assignment': 'off',
      // The demo script strips ANSI colours; money parsing strips no-break spaces.
      'no-control-regex': 'off',
      'no-irregular-whitespace': ['error', { skipRegExps: true }],
    },
  },
);
