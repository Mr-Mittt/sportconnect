import js from '@eslint/js';
import prettier from 'eslint-config-prettier';
import jsxA11y from 'eslint-plugin-jsx-a11y';
import reactHooks from 'eslint-plugin-react-hooks';
import reactRefresh from 'eslint-plugin-react-refresh';
import globals from 'globals';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  {
    ignores: [
      'dist',
      'storybook-static',
      'test-results',
      'playwright-report',
      'docs',
    ],
  },
  {
    files: ['**/*.{ts,tsx}'],
    extends: [
      js.configs.recommended,
      ...tseslint.configs.recommended,
      jsxA11y.flatConfigs.recommended,
      reactHooks.configs.flat.recommended,
      reactRefresh.configs.vite,
      prettier,
    ],
    languageOptions: {
      ecmaVersion: 2023,
      globals: globals.browser,
    },
    rules: {
      // jsx-a11y only recognizes the literal `label` element by default —
      // our shared Label component wraps it, so the rule can't see through
      // to the real <label htmlFor> it renders without this hint.
      'jsx-a11y/label-has-associated-control': ['error', { labelComponents: ['Label'] }],
    },
  },
  {
    // Playwright fixtures (e.g. test.extend({ page: async ({ page }, use) => ... }))
    // use a callback param literally named `use` — react-hooks/rules-of-hooks
    // misreads that as a React hook call outside a component. This is pure
    // Playwright test infra, never React component code.
    files: ['e2e/**/*.ts'],
    rules: {
      'react-hooks/rules-of-hooks': 'off',
    },
  },
);
