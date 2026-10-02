/* global HTMLInputElement, console, document, InputEvent, requestAnimationFrame, window */

import { createReadStream, existsSync, statSync } from 'node:fs'
import { createServer } from 'node:http'
import { extname, resolve } from 'node:path'
import { fileURLToPath, URL } from 'node:url'
import { chromium } from '@playwright/test'

const root = fileURLToPath(new URL('..', import.meta.url))
const ports = { 'benos-slice': 4392, 'solid-slice': 4393 }

function startServer(name) {
  const directory = resolve(root, `dist/${name}`)
  const server = createServer((request, response) => {
    const requestPath = (request.url ?? '/').split('?')[0] || '/'
    const file = resolve(
      directory,
      requestPath === '/'
        ? `${name === 'benos-slice' ? 'benos' : 'solid'}-slice.html`
        : `.${requestPath}`,
    )
    if (
      !file.startsWith(directory) ||
      !existsSync(file) ||
      !statSync(file).isFile()
    ) {
      response.writeHead(404)
      response.end('Not found')
      return
    }
    const extension = extname(file)
    response.writeHead(200, {
      'content-type':
        extension === '.html'
          ? 'text/html'
          : extension === '.js'
            ? 'text/javascript'
            : 'application/octet-stream',
    })
    createReadStream(file).pipe(response)
  })
  return new Promise((resolveServer, reject) => {
    server.once('error', reject)
    server.listen(ports[name], '127.0.0.1', () => resolveServer(server))
  })
}

function summarize(profile) {
  const nodes = new Map(profile.nodes.map((node) => [node.id, node]))
  const selfTime = new Map()
  for (let index = 0; index < profile.samples.length; index++) {
    const nodeId = profile.samples[index]
    const duration = profile.timeDeltas?.[index] ?? 0
    selfTime.set(nodeId, (selfTime.get(nodeId) ?? 0) + duration)
  }
  return [...selfTime.entries()]
    .sort((left, right) => right[1] - left[1])
    .slice(0, 12)
    .map(([nodeId, microseconds]) => {
      const node = nodes.get(nodeId)
      return {
        function: node?.callFrame.functionName || '(anonymous)',
        url: node?.callFrame.url ?? '',
        line: node?.callFrame.lineNumber ?? -1,
        selfMs: Number((microseconds / 1000).toFixed(3)),
      }
    })
}

const servers = {
  'benos-slice': await startServer('benos-slice'),
  'solid-slice': await startServer('solid-slice'),
}
const browser = await chromium.launch({ headless: true })
const results = {}
try {
  for (const name of Object.keys(servers)) {
    const page = await browser.newPage()
    await page.goto(`http://127.0.0.1:${ports[name]}/`, { waitUntil: 'load' })
    await page.waitForFunction(() => window.__dashboardReady === true)
    await page.waitForSelector('input[aria-label="Filter records"]')
    const client = await page.context().newCDPSession(page)
    await client.send('Profiler.enable')
    await client.send('Profiler.start')
    await page.evaluate(async () => {
      const input = document.querySelector('input[aria-label="Filter records"]')
      if (!(input instanceof HTMLInputElement))
        throw new Error('Filter input missing')
      for (const value of ['DOM']) {
        input.value = value
        input.dispatchEvent(
          new InputEvent('input', { bubbles: true, inputType: 'insertText' }),
        )
        await new Promise((resolve) => requestAnimationFrame(resolve))
        if (document.querySelectorAll('tbody tr').length === 0)
          throw new Error('Filtered table is empty')
      }
    })
    const { profile } = await client.send('Profiler.stop')
    results[name] = {
      samples: profile.samples.length,
      topSelfTime: summarize(profile),
    }
    await client.send('Profiler.disable')
    await page.close()
  }
} finally {
  await browser.close()
  for (const server of Object.values(servers))
    await new Promise((resolveServer) => server.close(resolveServer))
}

console.log(JSON.stringify(results, null, 2))
