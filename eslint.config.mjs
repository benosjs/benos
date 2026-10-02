import js from '@eslint/js'
import tseslint from 'typescript-eslint'

export default tseslint.config(
  {
    ignores: [
      '**/dist/**',
      '**/node_modules/**',
      '**/coverage/**',
      'packages/create-benos/template/**',
    ],
  },
  {
    files: ['benchmarks/js-framework-benchmark/**/*.{js,jsx,mjs}'],
    languageOptions: {
      globals: {
        MouseEvent: 'readonly',
        URL: 'readonly',
        document: 'readonly',
        performance: 'readonly',
        process: 'readonly',
        queueMicrotask: 'readonly',
        window: 'readonly',
      },
    },
  },
  js.configs.recommended,
  ...tseslint.configs.strict,
)
