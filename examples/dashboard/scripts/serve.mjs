/* global console, process, Request, AbortController */
// Serves the built dashboard: static assets from the client build, every
// other GET through the server entry. It uses node:http, which Bun provides
// as well, so `node scripts/serve.mjs` and `bun scripts/serve.mjs` both work.
// Build first: `pnpm build && pnpm build:ssr`.

import { createReadStream, existsSync, statSync } from 'node:fs'
import { readFile } from 'node:fs/promises'
import { createServer } from 'node:http'
import { extname, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL, URL } from 'node:url'

const root = fileURLToPath(new URL('..', import.meta.url))
const client = resolve(root, 'dist/benos')
const port = Number(process.argv[process.argv.indexOf('--port') + 1]) || 4175
const template = await readFile(resolve(client, 'index.html'), 'utf8')
const { handle } = await import(
  pathToFileURL(resolve(root, 'dist/server/entry-server.js')).href
)

const types = {
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.map': 'application/json',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
}

const server = createServer(async (incoming, outgoing) => {
  const path = (incoming.url ?? '/').split('?')[0] || '/'
  const file = resolve(client, `.${path}`)
  if (
    path !== '/' &&
    file.startsWith(client) &&
    existsSync(file) &&
    statSync(file).isFile()
  ) {
    outgoing.writeHead(200, {
      'content-type': types[extname(file)] ?? 'application/octet-stream',
    })
    createReadStream(file).pipe(outgoing)
    return
  }
  const controller = new AbortController()
  incoming.on('close', () => controller.abort())
  try {
    const response = await handle(
      new Request(`http://127.0.0.1:${port}${incoming.url ?? '/'}`, {
        method: incoming.method,
        headers: incoming.headers,
        signal: controller.signal,
      }),
      template,
    )
    outgoing.writeHead(response.status, Object.fromEntries(response.headers))
    outgoing.end(await response.text())
  } catch (error) {
    if (controller.signal.aborted) return
    console.error(error)
    outgoing.writeHead(500, { 'content-type': 'text/plain' })
    outgoing.end('Internal error')
  }
})

server.listen(port, '127.0.0.1', () => {
  console.log(`Dashboard served at http://127.0.0.1:${port}/`)
})
