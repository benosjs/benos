# @benosjs/server

![Benos logo](https://raw.githubusercontent.com/benosjs/benos/main/assets/brand/benos-mark-navy.png)

Server rendering for Benos. `renderToString` runs the same components as the
browser, waits for resources and queries that opted into serialization, and
returns HTML with hydration markers and a data payload for
`@benosjs/dom/hydrate`.

```tsx
import { renderToString } from '@benosjs/server'
import { App } from './app'

export async function handle(request: Request): Promise<Response> {
  const { html, status, headers } = await renderToString(() => <App />, {
    signal: request.signal,
  })
  headers.set('content-type', 'text/html; charset=utf-8')
  return new Response(`<!doctype html><div id="app">${html}</div>`, {
    status,
    headers,
  })
}
```

It uses only Web APIs, so it runs on Node 20+, Bun, Deno, and edge runtimes.
See the [SSR architecture](https://github.com/benosjs/benos/blob/main/docs/architecture/ssr.md).
