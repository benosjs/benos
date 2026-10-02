# @benosjs/vite

The Vite plugin that transforms raw Benos TSX before other JSX transforms and
connects the compiler to the DOM runtime.

```ts
import { defineConfig } from 'vite'
import benos from '@benosjs/vite'

export default defineConfig({ plugins: [benos()] })
```

See the [getting-started guide](../../docs/getting-started.md) and
[compiler design](../../docs/architecture/compiler.md).

MIT licensed. See [LICENSE](LICENSE).
