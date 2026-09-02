/**
 * Node backend variant of the shared config: same rule posture, no React
 * plugins, Node globals only.
 *
 *   // eslint.config.js
 *   import node from '@geeksuite/eslint-config/node';
 *   export default node;
 *
 * Not yet wired into the backends — the frontends and shared packages were the
 * scope of the lint rollout. Adopt it per backend as each one goes green.
 */
import js from '@eslint/js';
import globals from 'globals';

import { coreRules, ignores, testGlobals } from './index.js';

/** @type {import('eslint').Linter.Config[]} */
const config = [
  { ignores },
  {
    files: ['**/*.{js,mjs}'],
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
      globals: globals.node,
    },
    rules: { ...js.configs.recommended.rules, ...coreRules },
  },
  {
    files: ['**/*.cjs'],
    languageOptions: { sourceType: 'commonjs', globals: globals.node },
    rules: { ...js.configs.recommended.rules, ...coreRules },
  },
  {
    files: ['**/*.{test,spec}.{js,mjs,cjs}', '**/__tests__/**/*.js'],
    languageOptions: { globals: { ...globals.node, ...testGlobals } },
  },
];

export default config;
