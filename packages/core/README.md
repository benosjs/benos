# @benosjs/core

![Benos logo](https://raw.githubusercontent.com/benosjs/benos/main/assets/brand/benos-mark-navy.png)

The small reactive kernel for Benos: signals, computed values, effects,
batching, roots, ownership, contexts, cleanup, and error routing.

```ts
import { computed, effect, signal } from '@benosjs/core'

const count = signal(0)
const doubled = computed(() => count() * 2)
const dispose = effect(() => console.log(doubled()))
count.set(1)
dispose()
```

See the [API reference](../../docs/api-reference.md) and
[reactivity design](../../docs/architecture/reactivity.md).

MIT licensed. See [LICENSE](LICENSE).
