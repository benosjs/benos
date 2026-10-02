import eslint from '@eslint/js'
import benos from '@benosjs/eslint-plugin'
import tseslint from 'typescript-eslint'

export default tseslint.config(
  { ignores: ['dist/**', 'node_modules/**', 'coverage/**'] },
  eslint.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ['**/*.{ts,tsx}'],
    plugins: { benos },
    rules: { 'benos/no-props-destructuring': 'error' },
  },
)
