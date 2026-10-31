/** @jsxImportSource @benosjs/dom */

import { memoryHistory, RouterOutlet } from '@benosjs/router'
import { renderToStream } from '@benosjs/server'
import { createDashboardRouter } from './routes/manifest.js'

// The bundled renderers, for benchmarks/stream.mjs: it must compare the
// same compiled app through the same module instances.
export { renderToStream, renderToString } from '@benosjs/server'

const encoder = new TextEncoder()

/** The app for one request: its own router on a memory history at the URL. */
export const createApp = (url: URL) => () => (
  <RouterOutlet
    router={createDashboardRouter(
      memoryHistory({ initialEntries: [url.pathname + url.search] }),
    )}
  />
)

/** The template's head and tail around the app, then the app's stream. */
function wrap(
  head: string,
  app: ReadableStream<Uint8Array>,
  tail: string,
): ReadableStream<Uint8Array> {
  const reader = app.getReader()
  let started = false
  return new ReadableStream<Uint8Array>({
    async pull(controller) {
      if (!started) {
        started = true
        controller.enqueue(encoder.encode(head))
      }
      const { value, done } = await reader.read()
      if (done) {
        controller.enqueue(encoder.encode(tail))
        controller.close()
      } else controller.enqueue(value)
    },
    cancel(reason) {
      return reader.cancel(reason)
    },
  })
}

/**
 * Renders the dashboard for one request. `template` is the client build's
 * `index.html`, which carries the hashed script and stylesheet tags; the
 * rendered app streams into its empty host: the shell once the router's
 * loaders have settled, then the activity boundary as its data arrives. The
 * handler uses only Web APIs, so any runtime that speaks `Request` and
 * `Response` can call it.
 */
export async function handle(
  request: Request,
  template: string,
): Promise<Response> {
  const { stream, status, headers } = await renderToStream(
    createApp(new URL(request.url)),
    { signal: request.signal },
  )
  headers.set('content-type', 'text/html; charset=utf-8')
  const host = '<div id="app"></div>'
  const at = template.indexOf(host)
  const head = `${template.slice(0, at)}<div id="app">`
  const tail = `</div>${template.slice(at + host.length)}`
  return new Response(wrap(head, stream, tail), { status, headers })
}
