module.exports = {
  extends: [
    'react-app',
    'react-app/jest'
  ],
  env: {
    browser: true,
    es2021: true,
    node: true
  },
  globals: {
    BigInt: 'readonly',
    window: 'readonly'
  },
  rules: {
    'no-undef': 'error',
    'no-unused-vars': 'warn'
  }
};
