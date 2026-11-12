import tsParser from '@typescript-eslint/parser'
import tsPlugin from '@typescript-eslint/eslint-plugin'
import preferArrow from 'eslint-plugin-prefer-arrow'

// sprite-strip's config, plus the core rules of the app's .eslintrc that this code was written under.
export default [
  {
    ignores: ['dist/**'],
  },
  {
    files: ['**/*.ts'],
    languageOptions: {
      parser: tsParser,
      parserOptions: {
        project: './tsconfig.json',
      },
    },
    plugins: {
      '@typescript-eslint': tsPlugin,
      'prefer-arrow': preferArrow,
    },
    rules: {
      semi: ['error', 'never'],
      quotes: ['error', 'single'],
      indent: ['error', 2],
      'no-var': 'error',
      'prefer-const': 'error',
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/explicit-function-return-type': 'error',
      'prefer-arrow/prefer-arrow-functions': [
        'error',
        {
          disallowPrototype: true,
          singleReturnOnly: false,
          classPropertiesAllowed: false,
        },
      ],
      'func-style': ['error', 'expression'],
      'comma-dangle': ['error', {
        arrays: 'only-multiline',
        objects: 'only-multiline',
        imports: 'only-multiline',
        exports: 'only-multiline',
        functions: 'only-multiline',
      }],
      'dot-notation': 'error',
      eqeqeq: ['error', 'smart'],
      'guard-for-in': 'error',
      'linebreak-style': ['error', 'unix'],
      'max-classes-per-file': ['error', 1],
      'new-parens': 'error',
      'no-bitwise': 'error',
      'no-caller': 'error',
      'no-cond-assign': 'error',
      'no-console': ['error', { allow: ['info', 'warn', 'error'] }],
      'no-debugger': 'error',
      'no-empty': 'error',
      'no-eval': 'error',
      'no-multiple-empty-lines': ['error', { max: 2, maxEOF: 1 }],
      'no-new-wrappers': 'error',
      'no-shadow': ['error', { hoist: 'all' }],
      'no-trailing-spaces': 'error',
      'no-undef-init': 'error',
      'no-underscore-dangle': 'error',
      'no-unsafe-finally': 'error',
      'no-unused-expressions': 'error',
      'no-unused-labels': 'error',
      'object-shorthand': 'error',
      'one-var': ['error', 'never'],
      radix: 'error',
      'spaced-comment': 'error',
      'use-isnan': 'error',
    },
  },
]
