/** @jsxImportSource @benosjs/dom */

import { memoryHistory, RouterOutlet } from '@benosjs/router'
import { renderToString } from '@benosjs/server'
import { createDashboardRouter } from './routes/manifest.js'

/**
 * Renders the dashboard for one request. `template` is the client build's
 * `index.html`, which carries the hashed script and stylesheet tags; the
 * rendered app replaces its empty host. The handler uses only Web APIs, so
 * any runtime that speaks `Request` and `Response` can call it.
 */
export async function handle(
  request: Request,
  template: string,
): Promise<Response> {
  const url = new URL(request.url)
  const { html, status, headers } = await renderToString(
    () => (
      <RouterOutlet
        router={createDashboardRouter(
          memoryHistory({ initialEntries: [url.pathname + url.search] }),
        )}
      />
    ),
    { signal: request.signal },
  )
  headers.set('content-type', 'text/html; charset=utf-8')
  return new Response(
    template.replace('<div id="app"></div>', `<div id="app">${html}</div>`),
    { status, headers },
  )
}
