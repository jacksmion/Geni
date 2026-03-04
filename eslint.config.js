import js from '@eslint/js';
import globals from 'globals';
import reactHooks from 'eslint-plugin-react-hooks';
import reactRefresh from 'eslint-plugin-react-refresh';
import reactPlugin from 'eslint-plugin-react';
import tseslint from 'typescript-eslint';

export default tseslint.config(
    { ignores: ['dist', 'dist-electron', 'release', 'node_modules'] },
    {
        extends: [
            js.configs.recommended,
            ...tseslint.configs.recommended,
        ],
        files: ['**/*.{ts,tsx}'],
        languageOptions: {
            ecmaVersion: 2020,
            globals: {
                ...globals.browser,
                ...globals.node,
                ...globals.es2020,
            },
            // parserOptions: {
            //     project: ['./tsconfig.json'],
            //     tsconfigRootDir: import.meta.dirname,
            // },
        },
        plugins: {
            'react-hooks': reactHooks,
            'react-refresh': reactRefresh,
            'react': reactPlugin,
        },
        settings: {
            react: {
                version: 'detect',
            },
        },
        rules: {
            ...reactHooks.configs.recommended.rules,
            ...reactPlugin.configs.recommended.rules,
            ...reactPlugin.configs['jsx-runtime'].rules,
            'react-refresh/only-export-components': [
                'warn',
                { allowConstantExport: true },
            ],
            'react/react-in-jsx-scope': 'off', // Not needed in React 17+
            '@typescript-eslint/no-explicit-any': 'warn',
            '@typescript-eslint/no-unused-vars': ['warn', { argsIgnorePattern: '^_' }],
        },
    }
);
