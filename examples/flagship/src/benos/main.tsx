import { render } from '@benosjs/dom'
import { browserHistory, RouterOutlet } from '@benosjs/router'
import { createAppRouter } from './routes/manifest.js'

const root = document.getElementById('app')
if (!root) throw new Error('Missing #app')
render(() => <RouterOutlet router={createAppRouter(browserHistory())} />, root)
