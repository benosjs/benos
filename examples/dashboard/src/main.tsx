/** @jsxImportSource @benosjs/dom */

import { render } from '@benosjs/dom'
import { hydrate } from '@benosjs/dom/hydrate'
import type { HydrationMismatch } from '@benosjs/dom/hydrate'
import { browserHistory, RouterOutlet } from '@benosjs/router'
import { createDashboardRouter } from './routes/manifest.js'
import './dashboard.css'

const appHost = document.querySelector('#app')
if (!(appHost instanceof HTMLElement))
  throw new Error('Dashboard host is missing')

const app = () => (
  <RouterOutlet router={createDashboardRouter(browserHistory())} />
)

// A page the server rendered starts with the root marker; hydrate it. The
// built entry loads `async`, so on a streamed page it may run while the
// shell is still arriving: an empty host in a parsing document is a server
// page too, and `hydrate` waits for the shell. The dev server's deferred
// entry sees a complete, empty host and renders from scratch.
const first = appHost.firstChild
const serverRendered =
  (first?.nodeType === Node.COMMENT_NODE &&
    (first as Comment).data.startsWith('benos:')) ||
  (!first && document.readyState === 'loading')
const mismatches: HydrationMismatch[] = []
const started = performance.now()
if (serverRendered)
  hydrate(app, appHost, { onMismatch: (info) => mismatches.push(info) })
else render(app, appHost)
window.__dashboardHydration = {
  serverRendered,
  mismatches,
  // The synchronous part: the claim (or the client render) of the shell.
  duration: performance.now() - started,
}
window.__dashboardReady = true
