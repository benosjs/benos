/** @jsxImportSource @benosjs/dom */

import { render } from '@benosjs/dom'
import { RouterOutlet } from '@benosjs/router'
import { router } from './routes/manifest.js'
import './dashboard.css'

const appHost = document.querySelector('#app')
if (!(appHost instanceof HTMLElement))
  throw new Error('Dashboard host is missing')

render(() => <RouterOutlet router={router} />, appHost)
window.__dashboardReady = true
