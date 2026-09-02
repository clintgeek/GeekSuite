/**
 * Shared ESLint 9 flat config for GeekSuite frontends and shared packages.
 *
 * Usage, from any app or package that declares `@geeksuite/eslint-config`:
 *
 *   // eslint.config.js
 *   import geeksuite from '@geeksuite/eslint-config';
 *   export default geeksuite;
 *
 * To add app-local rules, spread it:
 *
 *   export default [...geeksuite, { rules: { 'no-console': 'warn' } }];
 *
 * Rule posture (see DOCS/CICD.md — the lint job does not gate on warnings):
 * anything that is a genuine correctness signal is an `error`; anything that is
 * stylistic or advisory is a `warn`, so the baseline can be clean today without
 * mass-disabling rules that would catch real bugs tomorrow.
 */
import js from '@eslint/js';
import globals from 'globals';
import reactHooks from 'eslint-plugin-react-hooks';
import reactRefresh from 'eslint-plugin-react-refresh';

/**
 * Build output, dependency trees, coverage reports, and generated service
 * workers. `dev-dist/` is the vite-plugin-pwa dev output (bundled workbox);
 * linting it produces dozens of errors about minified code nobody wrote.
 */
export const ignores = [
  '**/node_modules/**',
  '**/dist/**',
  '**/dev-dist/**',
  '**/build/**',
  '**/coverage/**',
  '**/.vite/**',
  '**/.next/**',
  '**/*.min.js',
  // vite-plugin-pwa / workbox generated artifacts
  '**/workbox-*.js',
  '**/registerSW.js',
];

/** Browser + Node: apps are bundled for the browser, but their vite/vitest/
 * tailwind config files at the package root are Node modules. */
export const appGlobals = {
  ...globals.browser,
  ...globals.node,
};

/** Vitest with `globals: true` (notegeek, bujogeek). */
export const testGlobals = {
  describe: 'readonly',
  it: 'readonly',
  test: 'readonly',
  expect: 'readonly',
  vi: 'readonly',
  beforeAll: 'readonly',
  afterAll: 'readonly',
  beforeEach: 'readonly',
  afterEach: 'readonly',
  suite: 'readonly',
};

/**
 * Core rules, safe to apply anywhere (no plugin dependency). Everything here
 * is a downgrade from `js.configs.recommended`; the rules left untouched stay
 * errors on purpose, because they catch bugs rather than style:
 * `no-undef`, `no-dupe-keys`, `no-unreachable`, `no-func-assign`,
 * `no-cond-assign`, `no-fallthrough`, `no-case-declarations`, ...
 */
export const coreRules = {
  'no-unused-vars': [
    'warn',
    {
      argsIgnorePattern: '^_',
      varsIgnorePattern: '^[A-Z_]',
      // `catch (e) {}` / `catch (err) {}` as a deliberate swallow is an idiom
      // used throughout the suite; an unused catch binding with a *meaningful*
      // name still warns, because that one usually is a mistake.
      caughtErrorsIgnorePattern: '^(_|e|err|error)$',
    },
  ],
  'no-empty': ['warn', { allowEmptyCatch: true }],
};

/** React rules. Only valid in a config object that also declares the plugins. */
export const reactRules = {
  'react-hooks/rules-of-hooks': 'error',
  'react-hooks/exhaustive-deps': 'warn',
  'react-refresh/only-export-components': ['warn', { allowConstantExport: true }],
};

export const rules = { ...coreRules, ...reactRules };

/** @type {import('eslint').Linter.Config[]} */
const config = [
  { ignores },
  {
    files: ['**/*.{js,jsx,mjs}'],
    plugins: {
      'react-hooks': reactHooks,
      'react-refresh': reactRefresh,
    },
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
      globals: appGlobals,
      parserOptions: {
        ecmaFeatures: { jsx: true },
      },
    },
    rules: {
      ...js.configs.recommended.rules,
      ...rules,
    },
  },
  // Hand-written service workers: `self`, `caches`, `fetch` come from the
  // browser set above; `importScripts`, `clients`, `registration`, and
  // `skipWaiting` are service-worker-only.
  {
    files: ['**/sw.js', '**/*-sw.js', '**/service-worker.js'],
    languageOptions: { globals: { ...appGlobals, ...globals.serviceworker } },
  },
  // CommonJS files keep `require`/`module` without a parse error.
  {
    files: ['**/*.cjs'],
    languageOptions: { sourceType: 'commonjs', globals: globals.node },
    // coreRules only: this object declares no plugins, and a flat-config object
    // may not name a rule from a plugin it hasn't loaded.
    rules: { ...js.configs.recommended.rules, ...coreRules },
  },
  // Test files: vitest `globals: true` injects describe/it/expect/vi.
  {
    files: [
      '**/*.{test,spec}.{js,jsx}',
      '**/__tests__/**/*.{js,jsx}',
      '**/__mocks__/**/*.{js,jsx}',
    ],
    languageOptions: { globals: { ...appGlobals, ...testGlobals } },
  },
];

export default config;
