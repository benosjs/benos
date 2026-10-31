/* global console, process, Request, URL, TextDecoder */
// Calls the built dashboard's server entry directly on this runtime (Node or
// Bun) and checks the rendered pages, their status codes, and that the
// client bundle carries no server renderer. Build the dashboard first:
// `pnpm --filter @benosjs/dashboard build && pnpm --filter @benosjs/dashboard build:ssr`.

import { readdir, readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const root = resolve(fileURLToPath(new URL('../', import.meta.url)))
const dashboard = resolve(root, 'examples/dashboard')
const template = await readFile(
  resolve(dashboard, 'dist/benos/index.html'),
  'utf8',
)
const { handle } = await import(
  pathToFileURL(resolve(dashboard, 'dist/server/entry-server.js')).href
)

async function page(path) {
  const response = await handle(
    new Request(`http://dashboard.test${path}`),
    template,
  )
  // The body streams: collect its chunks as a browser would receive them.
  const chunks = []
  const decoder = new TextDecoder()
  for await (const chunk of response.body) chunks.push(decoder.decode(chunk))
  const html = chunks.join('')
  // Markers split dynamic text; the checks read the text as a browser would.
  const text = html.replace(/<!--[^>]*-->/g, '').replace(/<[^>]+>/g, '')
  return { status: response.status, html, text, chunks }
}

const checks = [
  ['/', 200, 'Good morning, Ada'],
  ['/projects', 200, 'Signal runtime'],
  ['/projects/signals', 200, 'Project ID: signals'],
  ['/nowhere', 404, 'This route does not exist'],
]
for (const [path, status, text] of checks) {
  const result = await page(path)
  if (result.status !== status)
    throw new Error(`${path}: status ${result.status}, expected ${status}`)
  if (!result.text.includes(text))
    throw new Error(`${path}: rendered HTML lacks "${text}"`)
  if (!result.html.includes('<!--benos:0:1-->'))
    throw new Error(`${path}: rendered HTML lacks the root marker`)
  if (result.html.includes('<div id="app"></div>'))
    throw new Error(`${path}: the app host is empty`)
}
const detail = await page('/projects/signals')
if (!detail.html.includes('data-benos="0"'))
  throw new Error(
    '/projects/signals: no payload script for the opted-in queries',
  )
if (!detail.html.includes('"project"'))
  throw new Error('/projects/signals: the project query was not serialized')
// Streaming: the shell carries the activity fallback marked with its ID and
// goes out before the slow query settles; the patch and the end notice follow.
const shell = detail.chunks.findIndex((chunk) =>
  chunk.includes('<!--benos:0:1-->'),
)
if (shell === -1) throw new Error('/projects/signals: no shell chunk')
const body = detail.chunks.slice(shell)
const streamedId =
  /<!--b:0:(\d+)--><p class="form-status" role="status">Loading activity/.exec(
    body[0],
  )?.[1]
if (streamedId === undefined)
  throw new Error('/projects/signals: the shell lacks the streamed fallback')
if (body[0].includes('Scheduler batching landed'))
  throw new Error('/projects/signals: the shell waited for the slow query')
const patch = body.find((chunk) =>
  chunk.includes(`<template id="b:0:${streamedId}">`),
)
if (!patch || !patch.includes('Scheduler batching landed'))
  throw new Error('/projects/signals: no patch with the activity')
if (!patch.includes('"activity"'))
  throw new Error('/projects/signals: the activity query was not serialized')
if (
  !detail.chunks[detail.chunks.length - 1].includes('__benos_s.e("0")') &&
  !detail.chunks[detail.chunks.length - 2]?.includes('__benos_s.e("0")')
)
  throw new Error('/projects/signals: no end notice')
// A page without a streamed boundary is the shell alone.
const list = await page('/projects')
if (list.html.includes('__benos_s'))
  throw new Error('/projects: a page without pending data sent the runtime')

const assets = resolve(dashboard, 'dist/benos/assets')
for (const file of await readdir(assets)) {
  if (!file.endsWith('.js')) continue
  const source = await readFile(resolve(assets, file), 'utf8')
  if (source.includes('<!--benos:'))
    throw new Error(`${file}: the client bundle contains the server renderer`)
}

const runtime =
  typeof globalThis.Bun !== 'undefined'
    ? `Bun ${globalThis.Bun.version}`
    : `Node ${process.version}`
console.log(
  `Dashboard server entry passed ${checks.length} pages on ${runtime}.`,
)
