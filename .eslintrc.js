module.exports = {
  /* your base configuration of choice */
  // extends: 'eslint:recommended',
  ignorePatterns: ['src/main/lib/*.js'],
  extends: [
    'eslint:recommended', //所有在规则页面被标记为“✔️”的规则将会默认开启
    'plugin:react/recommended',
  ],

  parser: 'babel-eslint',
  parserOptions: {
    ecmaFeatures: {
      jsx: true,
      generators: true,
      experimentalObjectRestSpread: true,
    },
    ecmaVersion: 2018,
    sourceType: 'module',
  },
  settings: {
    'import/resolver': {
      webpack: {
        config: 'webpack.render.js',
      },
    },
  },
  env: {
    browser: true,
    node: true,
    es6: true,
  },
  globals: {
    __static: true,
  },
  rules: {
    indent: ['error', 2],
    'comma-dangle': 1,
    quotes: [0, 'single'],
    'global-strict': 0,
    'no-extra-semi': 1,
    'no-underscore-dangle': 0,
    'no-console': 0,
    'no-undef': 'warn',
    'no-unused-vars': [
      'warn',
      {
        vars: 'all',
        args: 'after-used',
        ignoreRestSiblings: false,
        varsIgnorePattern: 'createElement',
      },
    ],
    'no-trailing-spaces': [1, { skipBlankLines: true }],
    'no-unreachable': 1,
    'no-alert': 0,
    'no-mixed-spaces-and-tabs': 1,
    'no-empty-pattern': 1,
    'no-empty': 1,
    'no-useless-escape': 1,
    'no-case-declarations': 1,
    'no-debugger': 1,
    'react/no-string-refs': 1,
    'react/react-in-jsx-scope': 2,
    'react/no-direct-mutation-state': 1,
    'react/prop-types': 0,
    'react/jsx-uses-react': 2,
    'react/jsx-uses-vars': 2,
    'react/jsx-no-undef': 2,
    'react/display-name': 0,
    'react/no-deprecated': 0,
    'react/no-unescaped-entities': 1,
    'react/jsx-key': 1,
    'react/jsx-no-target-blank': 1,
    'react/no-find-dom-node': 1,
    experimentalDecorators: 0,
  },
};
