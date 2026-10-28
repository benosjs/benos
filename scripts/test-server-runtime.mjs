/* global console, process, URL */
// Renders a fixture with the built @benosjs/server on whatever runtime runs
// this file (Node in `pnpm test:server-runtime`, Bun in CI), and checks that
// the package's runtime output imports no `node:` module.

import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createUniqueId } from '../packages/core/dist/js/index.production.js'
import {
  Suspense,
  resource,
} from '../packages/async/dist/js/index.production.js'
import { For, Show, jsx } from '../packages/dom/dist/js/index.production.js'
import { renderToString } from '../packages/server/dist/js/index.production.js'

const root = resolve(fileURLToPath(new URL('../', import.meta.url)))

function Labeled() {
  const id = createUniqueId()
  return jsx('label', { for: id, children: jsx('input', { id }) })
}

function app() {
  const user = resource(
    () => 7,
    () => Promise.resolve({ name: 'Ada', secret: 'hunter2' }),
    {
      ssr: {
        id: 'user',
        key: String,
        serialize: (value) => ({ name: value.name }),
        deserialize: (value) => ({ ...value, secret: '' }),
      },
    },
  )
  return jsx('main', {
    children: [
      jsx(Labeled, {}),
      jsx(For, {
        each: ['a', 'b'],
        children: (item) => jsx('i', { children: item() }),
      }),
      jsx(Show, { when: false, children: 'hidden' }),
      jsx(Suspense, {
        fallback: 'loading',
        children: jsx(
          () =>
            jsx('b', {
              get children() {
                return user.read()?.name
              },
            }),
          {},
        ),
      }),
    ],
  })
}

const expected =
  '<!--benos:0:1--><main>' +
  '<label for="b0-0-1-0"><input id="b0-0-1-0"></label>' +
  '<!--b--><!--b--><i>a</i><!--/b--><!--b--><i>b</i><!--/b--><!--/b-->' +
  '<!--b--><!----><!--/b-->' +
  '<b><!--b-->Ada<!--/b--></b><!---->' +
  '</main><!--/benos:0-->' +
  '<script type="application/json" data-benos="0">{"v":1,"r":[["user","7",{"name":"Ada"}]],"q":[]}</script>'

const { html, status } = await renderToString(app)
if (html !== expected || status !== 200) {
  console.error('Expected:\n' + expected + '\nReceived:\n' + html)
  throw new Error('Server runtime fixture output differs')
}

for (const file of ['index.production.js', 'index.development.js']) {
  const source = await readFile(
    resolve(root, 'packages/server/dist/js', file),
    'utf8',
  )
  if (/from\s*["']node:/.test(source))
    throw new Error(`${file} imports a node: module`)
}

const runtime =
  typeof globalThis.Bun !== 'undefined'
    ? `Bun ${globalThis.Bun.version}`
    : typeof globalThis.Deno !== 'undefined'
      ? 'Deno'
      : `Node ${process.version}`
console.log(`Server runtime fixture passed on ${runtime}.`)
