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

// A page the server rendered starts with the root marker; hydrate it.
// Otherwise render from scratch, as the dev server does.
const first = appHost.firstChild
const serverRendered =
  first?.nodeType === Node.COMMENT_NODE &&
  (first as Comment).data.startsWith('benos:')
const mismatches: HydrationMismatch[] = []
if (serverRendered)
  hydrate(app, appHost, { onMismatch: (info) => mismatches.push(info) })
else render(app, appHost)
window.__dashboardHydration = { serverRendered, mismatches }
window.__dashboardReady = true
