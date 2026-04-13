/** @type {import('tailwindcss').Config} */
export default {
    content: [
        "./index.html",
        "./src/renderer/**/*.{js,ts,jsx,tsx}",
    ],
    darkMode: 'class',
    theme: {
        extend: {
            colors: {
                // indigo-* 保留（已有大量使用），同时映射到 primary CSS 变量
                indigo: {
                    50:  'rgb(var(--color-primary-50) / <alpha-value>)',
                    100: 'rgb(var(--color-primary-100) / <alpha-value>)',
                    200: 'rgb(var(--color-primary-200) / <alpha-value>)',
                    300: 'rgb(var(--color-primary-300) / <alpha-value>)',
                    400: 'rgb(var(--color-primary-400) / <alpha-value>)',
                    500: 'rgb(var(--color-primary-500) / <alpha-value>)',
                    600: 'rgb(var(--color-primary-600) / <alpha-value>)',
                    700: 'rgb(var(--color-primary-700) / <alpha-value>)',
                    800: 'rgb(var(--color-primary-800) / <alpha-value>)',
                    900: 'rgb(var(--color-primary-900) / <alpha-value>)',
                    950: 'rgb(var(--color-primary-950) / <alpha-value>)',
                },
                // primary-* 语义别名（新代码推荐使用）
                primary: {
                    50:  'rgb(var(--color-primary-50) / <alpha-value>)',
                    100: 'rgb(var(--color-primary-100) / <alpha-value>)',
                    200: 'rgb(var(--color-primary-200) / <alpha-value>)',
                    300: 'rgb(var(--color-primary-300) / <alpha-value>)',
                    400: 'rgb(var(--color-primary-400) / <alpha-value>)',
                    500: 'rgb(var(--color-primary-500) / <alpha-value>)',
                    600: 'rgb(var(--color-primary-600) / <alpha-value>)',
                    700: 'rgb(var(--color-primary-700) / <alpha-value>)',
                    800: 'rgb(var(--color-primary-800) / <alpha-value>)',
                    900: 'rgb(var(--color-primary-900) / <alpha-value>)',
                    950: 'rgb(var(--color-primary-950) / <alpha-value>)',
                },
                // 语义色彩 token（emerald / amber / red / violet 的语义别名）
                success: {
                    400: 'rgb(var(--color-success-400) / <alpha-value>)',
                    500: 'rgb(var(--color-success-500) / <alpha-value>)',
                    600: 'rgb(var(--color-success-600) / <alpha-value>)',
                },
                warning: {
                    400: 'rgb(var(--color-warning-400) / <alpha-value>)',
                    500: 'rgb(var(--color-warning-500) / <alpha-value>)',
                    600: 'rgb(var(--color-warning-600) / <alpha-value>)',
                },
                danger: {
                    400: 'rgb(var(--color-danger-400) / <alpha-value>)',
                    500: 'rgb(var(--color-danger-500) / <alpha-value>)',
                    600: 'rgb(var(--color-danger-600) / <alpha-value>)',
                },
                accent: {
                    400: 'rgb(var(--color-accent-400) / <alpha-value>)',
                    500: 'rgb(var(--color-accent-500) / <alpha-value>)',
                    600: 'rgb(var(--color-accent-600) / <alpha-value>)',
                },
            },
            boxShadow: {
                // 语义阴影 token
                'level-sm': 'var(--shadow-sm)',
                'level-md': 'var(--shadow-md)',
                'level-lg': 'var(--shadow-lg)',
                'level-xl': 'var(--shadow-xl)',
            },
            fontFamily: {
                display: ['var(--font-display)'],
                body:    ['var(--font-body)'],
                mono:    ['var(--font-mono)'],
            },
        },
    },
    plugins: [
        require('@tailwindcss/typography'),
    ],
}

