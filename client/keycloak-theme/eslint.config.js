import js from '@eslint/js';
import jsxA11y from 'eslint-plugin-jsx-a11y';
import reactHooks from 'eslint-plugin-react-hooks';
import globals from 'globals';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  { ignores: ['dist', 'dist_keycloak', 'storybook-static', 'public', 'src/kc.gen.tsx'] },
  {
    files: ['**/*.{ts,tsx}'],
    extends: [
      js.configs.recommended,
      ...tseslint.configs.recommended,
      jsxA11y.flatConfigs.recommended,
      reactHooks.configs.flat.recommended,
    ],
    languageOptions: { ecmaVersion: 2023, globals: globals.browser },
    rules: {
      // The client's shared Label wraps <label>; its htmlFor is set at each call site.
      'jsx-a11y/label-has-associated-control': ['error', { labelComponents: ['Label'] }],
    },
  },
);
