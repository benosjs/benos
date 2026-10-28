// @vitest-environment happy-dom
import { afterEach, describe, expect, it } from 'vitest'
import {
  createContext,
  createUniqueId,
  effect,
  getContext,
  onCleanup,
  onMount,
  signal,
} from '@benosjs/core'
import { resource, Suspense } from '@benosjs/async'
import {
  Dynamic,
  ErrorBoundary,
  For,
  Match,
  Portal,
  Show,
  Switch,
  instantiate,
  jsx,
  render,
  type Child,
} from '@benosjs/dom'
import { renderToString } from '../src/index.js'

const roots: Array<() => void> = []
afterEach(() => {
  while (roots.length) roots.pop()?.()
  document.body.replaceChildren()
})

const formProperties = ['value', 'checked', 'selected'] as const

/**
 * Elements and text only, attributes sorted; comments are host details. The
 * client sets form state as properties and the server as attributes, so form
 * state is compared through the properties the parser derives from them.
 */
function canon(node: Node): string {
  if (node.nodeType === Node.TEXT_NODE) return `#t(${node.textContent})`
  if (node.nodeType === Node.COMMENT_NODE) return ''
  const element = node as Element
  const attrs = [...element.attributes]
    .filter((a) => !(formProperties as readonly string[]).includes(a.name))
    .map((a) => `${a.name}=${JSON.stringify(a.value)}`)
    .concat(
      formProperties
        .filter((name) => name in element)
        .map(
          (name) =>
            `@${name}=${JSON.stringify((element as unknown as Record<string, unknown>)[name])}`,
        ),
    )
    .sort()
    .join(' ')
  // A textarea's content is its value, compared through the property above.
  const children =
    element.localName === 'textarea'
      ? ''
      : [...element.childNodes].map(canon).join('')
  return `<${element.localName}${attrs ? ` ${attrs}` : ''}>${children}</${element.localName}>`
}

function stripMarkers(html: string): string {
  return html
    .replace(/<!--benos:[^>]*-->|<!--\/benos:[^>]*-->|<!--\/?b-->|<!---->/g, '')
    .replace(/<script type="application\/json"[^>]*>.*<\/script>$/s, '')
}

async function parity(app: () => Child): Promise<string> {
  const host = document.createElement('div')
  roots.push(render(app, host))
  const client = [...host.childNodes].map(canon).join('')
  const { html } = await renderToString(app)
  const parsed = document.createElement('div')
  // Slot markers stay for the parse: they keep adjacent text nodes apart.
  parsed.innerHTML = html.replace(
    /<!--benos:[^>]*-->|<!--\/benos:[^>]*-->|<script type="application\/json"[^>]*>.*<\/script>$/gs,
    '',
  )
  expect([...parsed.childNodes].map(canon).join('')).toBe(client)
  return html
}

const Theme = createContext('light')

describe('renderToString parity with the DOM renderer', () => {
  it('renders elements, attributes, and the URL and style rules alike', async () => {
    await parity(() =>
      jsx('section', {
        class: 'card',
        'aria-hidden': false,
        'data-count': 3,
        style: { color: 'red', '--gap': '4px', margin: null },
        children: [
          jsx('button', { disabled: true, type: 'button', children: 'Go' }),
          jsx('input', { value: 'typed', checked: false, readonly: false }),
          jsx('a', { href: 'javascript:alert(1)', children: 'bad' }),
          jsx('a', { href: 'data:text/html,x', children: 'bad data' }),
          jsx('img', { src: 'data:image/png;base64,AA', alt: '' }),
          jsx('a', { href: '/ok?a=1&b=2', children: 'fine' }),
        ],
      }),
    )
  })

  it('renders templates with dynamic text, attributes, and children', async () => {
    const count = signal(3)
    const html = await parity(() =>
      instantiate(
        {
          id: 't',
          nodes: [
            {
              op: 'element',
              tag: 'p',
              slot: 0,
              attrs: [['class', 'static']],
              children: [
                { op: 'text', value: 'Count: ' },
                { op: 'text', value: '', slot: 1 },
                { op: 'anchor', slot: 2 },
              ],
            },
          ],
        },
        (scope) => {
          scope.attr(0, 'title', () => `n${count()}`)
          scope.text(1, () => count())
          scope.child(2, () => jsx('em', { children: 'x' }))
        },
      ),
    )
    expect(html).toBe(
      '<!--benos:0:1--><p class="static" title="n3">Count: <!--b-->3<!--/b--><!--b--><em>x</em><!--/b--></p><!--/benos:0-->',
    )
  })

  it('renders control flow, context, and a provider alike', async () => {
    const items = signal([
      { id: 'a', name: 'A' },
      { id: 'b', name: 'B' },
    ])
    function Themed() {
      return jsx('i', { children: getContext(Theme) })
    }
    await parity(() =>
      jsx('div', {
        children: [
          jsx(Show, { when: true, children: jsx('b', { children: 'shown' }) }),
          jsx(Show, { when: false, fallback: 'fb', children: 'no' }),
          jsx(Switch, {
            fallback: 'none',
            children: [
              jsx(Match, { when: false, children: 'one' }),
              jsx(Match, { when: 1, children: jsx('u', { children: 'two' }) }),
            ],
          }),
          jsx(For, {
            each: items(),
            by: (item: { id: string }) => item.id,
            children: (item: () => { name: string }) =>
              jsx('li', { children: item().name }),
          }),
          jsx(For, { each: [], fallback: 'empty', children: () => 'x' }),
          jsx(Dynamic, { component: 'span', class: 'dyn', children: 'd' }),
          jsx(ErrorBoundary, {
            fallback: (error: Error) => jsx('s', { children: error.message }),
            children: jsx(() => {
              throw new Error('nope')
            }, {}),
          }),
          Theme.Provider({ value: 'dark', children: jsx(Themed, {}) }),
          jsx(Themed, {}),
        ],
      }),
    )
  })

  it('renders tables, selects, and SVG that round-trip through the parser', async () => {
    await parity(() =>
      jsx('div', {
        children: [
          jsx('table', {
            children: jsx('tbody', {
              children: jsx('tr', {
                children: [
                  jsx('td', { children: 'a' }),
                  jsx('td', {
                    children: jsx(Show, { when: true, children: 'b' }),
                  }),
                ],
              }),
            }),
          }),
          jsx('select', {
            children: [
              jsx('option', { value: '1', selected: true, children: 'One' }),
              jsx('option', { value: '2', children: 'Two' }),
            ],
          }),
          jsx('svg', {
            viewBox: '0 0 10 10',
            children: [
              jsx('circle', { cx: 5, cy: 5, r: 4 }),
              jsx('foreignObject', {
                children: jsx('div', { children: 'fo' }),
              }),
            ],
          }),
          jsx('textarea', { value: 'text area' }),
        ],
      }),
    )
  })
})

describe('server mode', () => {
  it('never runs effects or onMount, and runs cleanups when the render ends', async () => {
    const seen: string[] = []
    function App() {
      effect(() => seen.push('effect'))
      onMount(() => seen.push('mount'))
      onCleanup(() => seen.push('cleanup'))
      return jsx('p', { children: 'hi' })
    }
    const { html } = await renderToString(() => jsx(App, {}))
    expect(html).toBe('<!--benos:0:1--><p>hi</p><!--/benos:0-->')
    expect(seen).toEqual(['cleanup'])
  })

  it('never calls refs and serializes no event props', async () => {
    let ref = 0
    const { html } = await renderToString(() =>
      jsx('button', {
        ref: () => ref++,
        onClick: () => undefined,
        'on:custom': () => undefined,
        children: 'x',
      }),
    )
    expect(ref).toBe(0)
    expect(stripMarkers(html)).toBe('<button>x</button>')
  })

  it('reports a setup error, disposes, and rejects', async () => {
    const errors: unknown[] = []
    const seen: string[] = []
    await expect(
      renderToString(
        () => {
          onCleanup(() => seen.push('cleanup'))
          throw new Error('setup failed')
        },
        { onError: (error) => errors.push(error) },
      ),
    ).rejects.toThrow('setup failed')
    expect(errors).toHaveLength(1)
    expect(seen).toEqual(['cleanup'])
  })

  it('aborts: rejects with the reason, disposes, and cancels the fetch', async () => {
    const controller = new AbortController()
    const seen: string[] = []
    let fetchSignal: AbortSignal | undefined
    const pending = renderToString(
      () => {
        onCleanup(() => seen.push('cleanup'))
        resource(
          () => 1,
          (_key, context) => {
            fetchSignal = context.signal
            return new Promise<string>(() => undefined)
          },
          {
            ssr: {
              id: 'r',
              key: String,
              serialize: (v) => v,
              deserialize: (v) => v as string,
            },
          },
        )
        return 'x'
      },
      { signal: controller.signal },
    )
    controller.abort(new Error('client left'))
    await expect(pending).rejects.toThrow('client left')
    expect(seen).toEqual(['cleanup'])
    expect(fetchSignal?.aborted).toBe(true)
  })

  it('rejects an already aborted signal before rendering', async () => {
    const controller = new AbortController()
    controller.abort(new Error('gone'))
    let rendered = false
    await expect(
      renderToString(
        () => {
          rendered = true
          return 'x'
        },
        { signal: controller.signal },
      ),
    ).rejects.toThrow('gone')
    expect(rendered).toBe(false)
  })

  it('returns status 200 and empty headers by default', async () => {
    const result = await renderToString(() => 'x')
    expect(result.status).toBe(200)
    expect([...result.headers]).toEqual([])
    expect(result.payload).toBe('')
  })
})

describe('escaping and parser-sensitive elements', () => {
  it('escapes text and attributes by context', async () => {
    const { html } = await renderToString(() =>
      jsx('p', {
        title: 'a "q" <b> & c',
        children: '<script>alert("x")</script> & more',
      }),
    )
    expect(stripMarkers(html)).toBe(
      '<p title="a &quot;q&quot; &lt;b> &amp; c">&lt;script&gt;alert("x")&lt;/script&gt; &amp; more</p>',
    )
  })

  it('keeps static raw text and rejects dynamic content in script and style', async () => {
    const { html } = await renderToString(() =>
      jsx('style', { children: 'a > b { color: red }' }),
    )
    expect(stripMarkers(html)).toBe('<style>a > b { color: red }</style>')
    await expect(
      renderToString(() =>
        jsx('script', {
          get children() {
            return 'late'
          },
        }),
      ),
    ).rejects.toThrow('<script> cannot contain dynamic children')
    await expect(
      renderToString(() => jsx('script', { children: 'x</script>' })),
    ).rejects.toThrow('end tag')
  })

  it('emits no markers inside RCDATA elements', async () => {
    const value = signal('typed')
    const { html } = await renderToString(() =>
      instantiate(
        {
          id: 'ta',
          nodes: [
            {
              op: 'element',
              tag: 'textarea',
              children: [{ op: 'text', value: '', slot: 0 }],
            },
            {
              op: 'element',
              tag: 'title',
              children: [{ op: 'text', value: '', slot: 1 }],
            },
          ],
        },
        (scope) => {
          scope.text(0, () => value())
          scope.text(1, () => `<${value()}>`)
        },
      ),
    )
    expect(stripMarkers(html)).toBe(
      '<textarea>typed</textarea><title>&lt;typed&gt;</title>',
    )
  })

  it('rejects a <tr> outside a table section in development', async () => {
    await expect(
      renderToString(() =>
        jsx('table', {
          children: jsx('tr', { children: jsx('td', { children: 'x' }) }),
        }),
      ),
    ).rejects.toThrow('table > tr: <tr> must be inside')
  })
})

describe('markers and ids', () => {
  function Labeled() {
    const id = createUniqueId()
    return jsx('label', { for: id, children: jsx('input', { id }) })
  }

  it('delimits dynamic positions, items, empties, and portals', async () => {
    const { html } = await renderToString(() =>
      jsx('div', {
        children: [
          jsx(For, {
            each: ['a', 'b'],
            children: (item: () => string) => jsx('i', { children: item() }),
          }),
          jsx(Show, { when: false, children: 'x' }),
          jsx(Portal, { mount: null, children: 'never' }),
        ],
      }),
    )
    expect(html).toBe(
      '<!--benos:0:1--><div>' +
        '<!--b--><!--b--><i>a</i><!--/b--><!--b--><i>b</i><!--/b--><!--/b-->' +
        '<!--b--><!----><!--/b-->' +
        '<!--b--><!--/b-->' +
        '</div><!--/benos:0-->',
    )
  })

  it('derives the same ids for the same app across requests and keyed items', async () => {
    const app = () =>
      jsx('div', {
        children: [
          jsx(Labeled, {}),
          jsx(For, {
            each: ['x', 'y'],
            children: () => jsx(Labeled, {}),
          }),
        ],
      })
    const first = await renderToString(app)
    const second = await renderToString(app)
    expect(first.html).toBe(second.html)
    expect(first.html).toContain('for="b0-0-0-0"')
    expect(first.html).toContain('for="b0-0-1-kx-0-0"')
    const other = await renderToString(app, { rootId: 'r2' })
    expect(other.html).toContain('for="br2-0-0-0"')
  })

  it('keeps concurrent requests apart', async () => {
    const app = (name: string) => () => {
      const data = resource(
        () => name,
        (key) => new Promise<string>((done) => setTimeout(() => done(key), 1)),
        {
          ssr: {
            id: 'name',
            key: (k) => k,
            serialize: (v) => v,
            deserialize: (v) => v as string,
          },
        },
      )
      return jsx(Suspense, {
        fallback: 'loading',
        children: jsx(
          () =>
            jsx('b', {
              get children() {
                return data.read()
              },
            }),
          {},
        ),
      })
    }
    const [a, b] = await Promise.all([
      renderToString(app('alpha'), { rootId: 'a' }),
      renderToString(app('beta'), { rootId: 'b' }),
    ])
    expect(stripMarkers(a.html)).toBe('<b>alpha</b>')
    expect(stripMarkers(b.html)).toBe('<b>beta</b>')
    expect(a.payload).toBe('{"v":1,"r":[["name","alpha","alpha"]],"q":[]}')
    expect(b.payload).toBe('{"v":1,"r":[["name","beta","beta"]],"q":[]}')
  })
})

describe('suspense and the payload', () => {
  const codec = {
    id: 'user',
    key: (id: number) => String(id),
    serialize: (value: { name: string; secret: string }) => ({
      name: value.name,
    }),
    deserialize: (value: unknown) => ({
      ...(value as { name: string }),
      secret: '',
    }),
  }

  it('leaves the fallback for a resource without a codec', async () => {
    let calls = 0
    const { html, payload } = await renderToString(() => {
      const user = resource(
        () => 1,
        () => {
          calls++
          return Promise.resolve({ name: 'Ada', secret: 's' })
        },
      )
      return jsx(Suspense, {
        fallback: jsx('p', { children: 'loading' }),
        children: jsx(
          () =>
            jsx('b', {
              get children() {
                return user.read()?.name
              },
            }),
          {},
        ),
      })
    })
    expect(stripMarkers(html)).toBe('<p>loading</p>')
    expect(payload).toBe('')
    expect(calls).toBe(0)
  })

  it('waits for a codec resource and serializes only the projection', async () => {
    const { html, payload } = await renderToString(() => {
      const user = resource(
        () => 7,
        () => Promise.resolve({ name: 'Ada <3', secret: 'hunter2' }),
        { ssr: codec },
      )
      return jsx(Suspense, {
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
      })
    })
    expect(stripMarkers(html)).toBe('<b>Ada &lt;3</b>')
    expect(payload).toBe(
      '{"v":1,"r":[["user","7",{"name":"Ada \\u003c3"}]],"q":[]}',
    )
    expect(html).toContain(
      `<script type="application/json" data-benos="0">${payload}</script>`,
    )
    expect(html).not.toContain('hunter2')
  })

  it('keeps the fallback when a codec resource fails and reports the error', async () => {
    const errors: unknown[] = []
    const { html, payload } = await renderToString(
      () => {
        const user = resource(
          () => 7,
          () => Promise.reject(new Error('db down')),
          {
            ssr: codec,
          },
        )
        return jsx(Suspense, {
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
        })
      },
      { onError: (error) => errors.push(error) },
    )
    expect(stripMarkers(html)).toBe('loading')
    expect(payload).toBe('')
    expect(errors.map((e) => (e as Error).message)).toEqual(['db down'])
  })

  it('enforces the payload limit and JSON-compatible values', async () => {
    const big = () => {
      resource(
        () => 1,
        () => Promise.resolve('x'.repeat(100)),
        {
          ssr: {
            id: 'big',
            key: String,
            serialize: (v) => v,
            deserialize: (v) => v as string,
          },
        },
      )
      return 'x'
    }
    await expect(renderToString(big, { maxPayloadBytes: 50 })).rejects.toThrow(
      RangeError,
    )
    await expect(
      renderToString(() => {
        resource(
          () => 1,
          () => Promise.resolve(1),
          {
            ssr: {
              id: 'fn',
              key: String,
              serialize: () => ({ run: () => 1 }),
              deserialize: () => 1,
            },
          },
        )
        return 'x'
      }),
    ).rejects.toThrow('resource fn serialized a function')
  })
})
