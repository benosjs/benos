/* global HTMLInputElement, InputEvent, console, document, performance, requestAnimationFrame, window */

import {
  createReadStream,
  existsSync,
  readFileSync,
  readdirSync,
  statSync,
  writeFileSync,
} from 'node:fs'
import { createServer } from 'node:http'
import { extname, resolve } from 'node:path'
import { fileURLToPath, URL } from 'node:url'
import { gzipSync } from 'node:zlib'
import { chromium } from '@playwright/test'

const root = fileURLToPath(new URL('..', import.meta.url))
const ports = { 'benos-slice': 4380, 'solid-slice': 4381 }

function startServer(name) {
  const directory = resolve(root, `dist/${name}`)
  const server = createServer((request, response) => {
    const path = (request.url ?? '/').split('?')[0] || '/'
    const file = resolve(
      directory,
      path === '/'
        ? name === 'solid-slice'
          ? 'solid-slice.html'
          : 'benos-slice.html'
        : `.${path}`,
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
    const type =
      extname(file) === '.html'
        ? 'text/html'
        : extname(file) === '.js'
          ? 'text/javascript'
          : 'application/octet-stream'
    response.writeHead(200, { 'content-type': type })
    createReadStream(file).pipe(response)
  })
  return new Promise((resolveServer, reject) => {
    server.once('error', reject)
    server.listen(ports[name], '127.0.0.1', () => resolveServer(server))
  })
}

function median(values) {
  const sorted = [...values].sort((a, b) => a - b)
  return sorted[Math.floor(sorted.length / 2)]
}

function gzipBytes(name) {
  const directory = resolve(root, `dist/${name}/assets`)
  const file = readdirSync(directory).find((entry) => entry.endsWith('.js'))
  if (!file) throw new Error(`No JavaScript bundle for ${name}`)
  return gzipSync(readFileSync(resolve(directory, file))).length
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
    const samples = []
    for (let round = 0; round < 7; round++) {
      samples.push(
        await page.evaluate(async () => {
          const input = document.querySelector(
            'input[aria-label="Filter records"]',
          )
          if (!(input instanceof HTMLInputElement))
            throw new Error('Filter input missing')
          const start = performance.now()
          input.value = 'DOM'
          input.dispatchEvent(
            new InputEvent('input', { bubbles: true, inputType: 'insertText' }),
          )
          await Promise.resolve()
          await new Promise((resolve) => requestAnimationFrame(() => resolve()))
          void document.body.offsetHeight
          if (document.querySelectorAll('tbody tr').length === 0)
            throw new Error('Filtered table is empty')
          return performance.now() - start
        }),
      )
      await page.evaluate(() => {
        const input = document.querySelector(
          'input[aria-label="Filter records"]',
        )
        if (input instanceof HTMLInputElement) {
          input.value = ''
          input.dispatchEvent(
            new InputEvent('input', {
              bubbles: true,
              inputType: 'deleteContentBackward',
            }),
          )
        }
      })
      await page.waitForTimeout(0)
    }
    results[name] = {
      bundleBytes: gzipBytes(name),
      updateMs: {
        median: median(samples),
        min: Math.min(...samples),
        max: Math.max(...samples),
        samples,
      },
    }
    await page.close()
  }
} finally {
  await browser.close()
  for (const server of Object.values(servers))
    await new Promise((resolveServer) => server.close(resolveServer))
}

writeFileSync(
  resolve(root, 'comparison-results.json'),
  `${JSON.stringify(results, null, 2)}\n`,
)
console.log(JSON.stringify(results, null, 2))
