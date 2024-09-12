/* eslint-env node */
require('@rushstack/eslint-patch/modern-module-resolution');

module.exports = {
    root: true,
    env: {
        browser: true,
        commonjs: true,
        es6: true,
        node: true,
        mocha: true,
        es2020: true
    },
    extends: ['plugin:vue/vue3-recommended', 'eslint:recommended', '@vue/eslint-config-typescript/recommended', '@vue/eslint-config-prettier'],
    parserOptions: {
        ecmaVersion: 2022,
        sourceType: 'module'
    },
    'prettier/prettier': [
        'error',
        {
            singleQuote: true,
            parser: 'flow'
        }
    ],
    rules: {
        'no-undef': 'error',
        '@typescript-eslint/no-unused-vars': 'off',
        'vue/require-default-prop': 'off',
        'vue/multi-word-component-names': 'off',
        'no-unused-vars': 'off',
        'no-class-static-properties': 'off',
        'no-empty': ['error', { allowEmptyCatch: true }],
        'linebreak-style': 'off'
    }
};
