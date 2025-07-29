import globals from 'globals';
import pluginJs from '@eslint/js';
import pluginPrettier from 'eslint-plugin-prettier';
import configPrettier from 'eslint-config-prettier';

/** @type {import('eslint').Linter.Config[]} */
export default [
  {
    files: ['**/*.js'],
    languageOptions: {
      sourceType: 'commonjs',
      globals: {
        ...globals.node, // Include Node.js globals
      },
    },
  },
  {
    languageOptions: {
      globals: globals.browser, // Include browser globals where needed
    },
  },
  pluginJs.configs.recommended,
  configPrettier, // Disable conflicting ESLint rules
  {
    ignores: ['public/**'], // Use "ignores" to specify the /public folder
  },
  {
    plugins: {
      prettier: pluginPrettier, // Add Prettier plugin
    },
    rules: {
      'prettier/prettier': 'error', // Show Prettier issues as ESLint errors
    },
  },
];
