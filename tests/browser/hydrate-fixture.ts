// The server renderer runs in the browser here: it uses only Web APIs, so
// the same page can produce the HTML, parse it with the real browser parser,
// and hydrate it. Apps use the runtime `jsx` API because this fixture's
// compiled output would use direct templates, which the server rejects.
import { createUniqueId, effect, onMount, signal } from '@benosjs/core'
import { resource, Suspense } from '@benosjs/async'
import { For, Portal, Show, jsx, render, type Child } from '@benosjs/dom'
import { hydrate, type HydrationMismatch } from '@benosjs/dom/hydrate'
import { renderToString } from '@benosjs/server'

const serverHost = document.querySelector<HTMLElement>('#server')
const clientHost = document.querySelector<HTMLElement>('#client')
const portalHost = document.querySelector<HTMLElement>('#portal')
if (!serverHost || !clientHost || !portalHost)
  throw new Error('Hydration fixture hosts are missing')

const events: string[] = []
const mismatches: HydrationMismatch[] = []
let disposers: Array<() => void> = []
let identity: Record<string, Node | null> = {}
let fetches = 0
let pendingResolve: ((value: { name: string }) => void) | null = null

const value = signal('server')
const count = signal(1)
const items = signal(['a', 'b', 'c'])

const codec = {
  id: 'user',
  key: (id: number) => String(id),
  serialize: (user: { name: string; secret: string }) => ({ name: user.name }),
  deserialize: (raw: unknown) => ({ ...(raw as { name: string }), secret: '' }),
}

function Labeled(): Child {
  const id = createUniqueId()
  return jsx('label', {
    for: id,
    children: jsx('input', { id, type: 'checkbox' }),
  })
}

function Basic(): Child {
  effect(() => events.push(`effect:${serverHost?.isConnected}`))
  onMount(() => events.push('mount'))
  return jsx('section', {
    id: 'basic',
    children: [
      jsx('p', {
        id: 'count',
        ref: (element: Element) => events.push(`ref:${element.id}`),
        get children() {
          return `Count: ${count()}`
        },
      }),
      jsx('button', {
        id: 'increment',
        type: 'button',
        onClick: () => count.set(count() + 1),
        children: '+',
      }),
      jsx('input', {
        id: 'field',
        get value() {
          return value()
        },
      }),
      jsx(Labeled, {}),
      jsx('ul', {
        id: 'list',
        children: jsx(For, {
          get each() {
            return items()
          },
          children: (item: () => string) => jsx('li', { children: item() }),
        }),
      }),
      jsx(Show, { when: false, children: 'hidden' }),
      jsx(Portal, {
        mount: portalHost,
        children: jsx('b', { id: 'portaled', children: 'portal' }),
      }),
    ],
  })
}

function ParserSensitive(): Child {
  return jsx('div', {
    id: 'parser',
    children: [
      jsx('table', {
        children: jsx('tbody', {
          children: jsx('tr', {
            children: [
              jsx('td', { children: 'a' }),
              jsx('td', {
                get children() {
                  return `n${count()}`
                },
              }),
            ],
          }),
        }),
      }),
      jsx('select', {
        id: 'select',
        children: [
          jsx('option', { value: '1', children: 'One' }),
          jsx('option', { value: '2', selected: true, children: 'Two' }),
        ],
      }),
      jsx('svg', {
        viewBox: '0 0 10 10',
        children: [
          jsx('circle', { cx: 5, cy: 5, r: 4 }),
          jsx('foreignObject', {
            children: jsx('div', { id: 'fo', children: 'fo' }),
          }),
        ],
      }),
      jsx('textarea', { id: 'area', value: 'text area' }),
    ],
  })
}

function Data(): Child {
  const user = resource(
    () => 7,
    () => {
      fetches++
      return pendingResolve
        ? new Promise<{ name: string; secret: string }>((done) => {
            pendingResolve = (next) => done({ ...next, secret: '' })
          })
        : Promise.resolve({ name: 'Ada', secret: 'hunter2' })
    },
    { ssr: codec },
  )
  return jsx(Suspense, {
    fallback: jsx('i', { id: 'loading', children: 'loading' }),
    children: jsx(
      () =>
        jsx('b', {
          id: 'name',
          get children() {
            return user.read()?.name
          },
        }),
      {},
    ),
  })
}

/** A 1,000-row table, for timing hydration against a client render. */
function Table(): Child {
  const rows = Array.from({ length: 1000 }, (_, index) => ({
    id: index + 1,
    name: `Record ${String(index + 1).padStart(5, '0')}`,
    team: ['Core', 'DOM', 'Compiler', 'Tooling', 'Examples'][index % 5],
    value: ((index * 37) % 997) + 3,
  }))
  return jsx('table', {
    id: 'bench',
    children: jsx('tbody', {
      children: jsx(For, {
        each: rows,
        by: (row: { id: number }) => row.id,
        children: (
          row: () => { id: number; name: string; team: string; value: number },
        ) =>
          jsx('tr', {
            get class() {
              return row().value > 500 ? 'high' : 'low'
            },
            children: [
              jsx('td', {
                get children() {
                  return row().id
                },
              }),
              jsx('td', {
                get children() {
                  return row().name
                },
              }),
              jsx('td', {
                get children() {
                  return row().team
                },
              }),
              jsx('td', {
                get children() {
                  return row().value
                },
              }),
            ],
          }),
      }),
    }),
  })
}

const scenarios: Record<string, () => Child> = {
  basic: Basic,
  parser: ParserSensitive,
  data: Data,
  table: Table,
}

function reset(): void {
  for (const dispose of disposers) dispose()
  disposers = []
  events.length = 0
  mismatches.length = 0
  identity = {}
  fetches = 0
  pendingResolve = null
  value.set('server')
  count.set(1)
  items.set(['a', 'b', 'c'])
  serverHost.replaceChildren()
  clientHost.replaceChildren()
  portalHost.replaceChildren()
}

async function serve(
  name: string,
  options: { dropPayload?: boolean; tamper?: boolean } = {},
): Promise<string> {
  reset()
  const app = scenarios[name]
  if (!app) throw new Error(`Unknown scenario ${name}`)
  const { html } = await renderToString(app)
  serverHost.innerHTML = options.dropPayload
    ? html.replace(/<script[^>]*>.*<\/script>$/s, '')
    : html
  if (options.tamper) {
    const second = serverHost.querySelectorAll('li')[1]
    const bogus = document.createElement('div')
    bogus.textContent = 'b'
    second?.replaceWith(bogus)
  }
  for (const id of [
    'basic',
    'count',
    'field',
    'list',
    'parser',
    'select',
    'fo',
    'area',
    'name',
  ])
    identity[id] = serverHost.querySelector(`#${id}`)
  identity.li = serverHost.querySelector('li')
  return html
}

function run(name: string): void {
  const app = scenarios[name]
  if (!app) throw new Error(`Unknown scenario ${name}`)
  disposers.push(
    hydrate(app, serverHost, { onMismatch: (info) => mismatches.push(info) }),
  )
  if (name !== 'basic') return
  // A client render of the same app, for shape comparison.
  disposers.push(render(app, clientHost))
}

/**
 * Elements and text, attributes sorted; form state through properties and
 * generated ids normalized, since a client render numbers them differently.
 */
function shape(node: Node): string {
  if (node.nodeType === Node.TEXT_NODE) return `#t(${node.textContent})`
  if (node.nodeType === Node.COMMENT_NODE) return '#c'
  const element = node as Element
  const attrs = [...element.attributes]
    .filter((a) => a.name !== 'value' && a.name !== 'checked')
    .map((a) =>
      (a.name === 'id' || a.name === 'for') && /^b[\w-]+$/.test(a.value)
        ? `${a.name}=ID`
        : `${a.name}=${JSON.stringify(a.value)}`,
    )
    .concat(
      ['value', 'checked']
        .filter((name) => name in element)
        .map(
          (name) =>
            `@${name}=${JSON.stringify((element as unknown as Record<string, unknown>)[name])}`,
        ),
    )
    .sort()
    .join(' ')
  return `<${element.localName}${attrs ? ` ${attrs}` : ''}>${[...element.childNodes].map(shape).join('')}</${element.localName}>`
}

function same(id: string): boolean {
  return (
    identity[id] !== null && identity[id] === serverHost.querySelector(`#${id}`)
  )
}

window.__benosHydrate = {
  serve,
  run,
  same,
  events,
  mismatches,
  fetches: () => fetches,
  resolve: (name: string) => pendingResolve?.({ name }),
  holdFetch: () => {
    pendingResolve = () => undefined
  },
  setValue: (next: string) => value.set(next),
  setItems: (next: string[]) => items.set(next),
  serverHtml: () => serverHost.innerHTML,
  clientHtml: () => clientHost.innerHTML,
  serverShape: () => [...serverHost.childNodes].map(shape).join(''),
  clientShape: () => [...clientHost.childNodes].map(shape).join(''),
  /** Milliseconds to hydrate the served table, then to client render it. */
  timeTable: () => {
    const app = scenarios.table as () => Child
    const hydrateStart = performance.now()
    disposers.push(hydrate(app, serverHost))
    const hydrated = performance.now() - hydrateStart
    const renderStart = performance.now()
    disposers.push(render(app, clientHost))
    const rendered = performance.now() - renderStart
    return { hydrated, rendered }
  },
  dispose: reset,
}

declare global {
  interface Window {
    __benosHydrate: {
      serve: typeof serve
      run: typeof run
      same: typeof same
      events: string[]
      mismatches: HydrationMismatch[]
      fetches: () => number
      resolve: (name: string) => void
      holdFetch: () => void
      setValue: (next: string) => void
      setItems: (next: string[]) => void
      serverHtml: () => string
      clientHtml: () => string
      serverShape: () => string
      clientShape: () => string
      timeTable: () => { hydrated: number; rendered: number }
      dispose: () => void
    }
  }
}
