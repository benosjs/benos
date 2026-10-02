# @benosjs/eslint-plugin

![Benos logo](https://raw.githubusercontent.com/benosjs/benos/main/assets/benos-logo.png)

ESLint rules for Benos component conventions. The v0.1 plugin includes the
`no-props-destructuring` rule, which catches snapshots of getter-backed props.

```js
import benos from '@benosjs/eslint-plugin'

export default [
  { plugins: { benos }, rules: { 'benos/no-props-destructuring': 'error' } },
]
```

See the [React migration guide](../../docs/react-migration.md).

MIT licensed. See [LICENSE](LICENSE).
