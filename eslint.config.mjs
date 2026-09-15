// Root ESLint flat config.
// TODO: import shared config from packages/config/eslint once dependencies are installed.
// import base from '@bazar/config/eslint';
export default [
  {
    ignores: ['**/node_modules/**', '**/dist/**', '**/.next/**', '**/.expo/**', '**/.turbo/**'],
  },
];
