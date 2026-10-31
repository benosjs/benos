/* global console, process, URL, TextDecoder */
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
import {
  renderToStream,
  renderToString,
} from '../packages/server/dist/js/index.production.js'

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
  '<!--b--><!--i--><i>a</i><!--/i--><!--i--><i>b</i><!--/i--><!--/b-->' +
  '<!--b--><!----><!--/b-->' +
  '<!--b:1--><b><!--b-->Ada<!--/b--></b><!--/b--><!---->' +
  '</main><!--/benos:0-->' +
  '<script type="application/json" data-benos="0">{"v":1,"r":[["user","7",{"name":"Ada"}]],"q":[]}</script>'

const { html, status } = await renderToString(app)
if (html !== expected || status !== 200) {
  console.error('Expected:\n' + expected + '\nReceived:\n' + html)
  throw new Error('Server runtime fixture output differs')
}

// Streaming: the shell carries the fallback marked with its boundary ID, the
// patch carries the content stage and the payload, and the end notice closes.
{
  let release
  const held = new Promise((resolve) => {
    release = resolve
  })
  const codec = {
    id: 'user',
    key: (id) => String(id),
    serialize: (value) => ({ name: value.name }),
    deserialize: (value) => ({ ...value, secret: '' }),
  }
  const streamApp = () => {
    const user = resource(
      () => 7,
      () => held,
      { ssr: codec },
    )
    return jsx('main', {
      children: [
        jsx('h1', { children: 'Shell' }),
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
  const result = await renderToStream(streamApp, { nonce: 'n1' })
  const reader = result.stream.getReader()
  const decoder = new TextDecoder()
  const chunks = []
  const first = await reader.read()
  chunks.push(decoder.decode(first.value))
  release({ name: 'Ada', secret: 'hunter2' })
  for (;;) {
    const { value, done } = await reader.read()
    if (done) break
    chunks.push(decoder.decode(value))
  }
  await result.done
  const problems = []
  if (result.status !== 200) problems.push(`status ${result.status}`)
  if (chunks.length !== 3) problems.push(`${chunks.length} chunks`)
  if (
    chunks[0] !==
    '<!--benos:0:1--><main><h1>Shell</h1><!--b:0:0-->loading<!--/b--><!----></main><!--/benos:0-->'
  )
    problems.push(`shell: ${chunks[0]}`)
  if (
    !chunks[1]?.startsWith(
      '<script nonce="n1">(function(){var s=self.__benos_s||',
    ) ||
    !chunks[1].includes(
      '<template id="b:0:0"><!--b:1--><b><!--b-->Ada<!--/b--></b><!--/b--></template>',
    ) ||
    !chunks[1].includes(
      '<script type="application/json" data-benos="0">{"v":1,"r":[["user","7",{"name":"Ada"}]],"q":[]}</script>',
    ) ||
    !chunks[1].includes('<script nonce="n1">__benos_s.p("0","0");') ||
    chunks[1].includes('hunter2')
  )
    problems.push(`patch: ${chunks[1]}`)
  if (!chunks[2]?.includes('__benos_s.e("0")'))
    problems.push(`end: ${chunks[2]}`)
  if (problems.length) {
    console.error(problems.join('\n'))
    throw new Error('Server streaming fixture output differs')
  }
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
