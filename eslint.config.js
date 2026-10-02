// https://docs.expo.dev/guides/using-eslint/
const { defineConfig } = require('eslint/config');
const expoConfig = require('eslint-config-expo/flat');

module.exports = defineConfig([
  expoConfig,
  {
    // Build output, and Edge Functions (Deno, `npm:` imports — not part of the app bundle).
    ignores: ['dist/*', 'supabase/functions/**'],
  },
  {
    rules: {
      // These three are React Compiler rules, and this app doesn't use the
      // compiler. `refs` flags the standard React Native Animated pattern
      // `useRef(new Animated.Value(0)).current`; `purity` flags Date.now()
      // inside event handlers defined during render; `use-memo` flags
      // `useMemo(fn, [])` with a named function. Revisit if the compiler is
      // turned on (app.json experiments.reactCompiler).
      'react-hooks/refs': 'off',
      'react-hooks/purity': 'off',
      'react-hooks/use-memo': 'off',
    },
  },
  {
    // Node scripts that regenerate the menu icons and the plane sprite sheet.
    files: ['tools/**/*.mjs'],
    languageOptions: { globals: { Buffer: 'readonly', process: 'readonly', console: 'readonly' } },
  },
]);
