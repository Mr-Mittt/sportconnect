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
      'playwright-report-keycloak',
      'docs',
      // Vite's dependency pre-bundle cache (git-ignored): created by any `pnpm dev` run, and full
      // of third-party code that fails our rule set.
      '.vite',
      // AUTH-15: the Keycloak theme is its own package with its own ESLint config (`pnpm lint`
      // inside client/keycloak-theme); the client's config must not lint it.
      'keycloak-theme',
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
    // AUTH-15: these files are compiled a second time by the Keycloak theme (client/keycloak-theme,
    // through its '@' alias), where there is no router, no i18next, no store and no app shell.
    // An import of one of those in a shared file would break the theme build while the client's
    // own CI stays green, so it is forbidden here. Keep this list in step with `@source` in
    // keycloak-theme/src/theme.css and `include` in keycloak-theme/tsconfig.json.
    files: [
      'src/shared/ui/button.tsx',
      'src/shared/ui/input.tsx',
      'src/shared/ui/label.tsx',
      'src/shared/lib/utils.ts',
      'src/features/auth/components/AuthShell.tsx',
      'src/features/auth/components/CommunityIllustration.tsx',
    ],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['@/app/*', '@/shared/stores/*', '@/features/*/use*'],
              message:
                'Shared with the Keycloak theme (AUTH-15): no app state, stores or data hooks in this file.',
            },
          ],
          paths: [
            { name: 'react-router-dom', message: 'Shared with the Keycloak theme (AUTH-15).' },
            { name: 'react-router', message: 'Shared with the Keycloak theme (AUTH-15).' },
            { name: 'react-i18next', message: 'Shared with the Keycloak theme (AUTH-15).' },
            { name: 'i18next', message: 'Shared with the Keycloak theme (AUTH-15).' },
            { name: 'zustand', message: 'Shared with the Keycloak theme (AUTH-15).' },
            { name: '@tanstack/react-query', message: 'Shared with the Keycloak theme (AUTH-15).' },
          ],
        },
      ],
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
