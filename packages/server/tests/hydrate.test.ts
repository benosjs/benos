// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  createUniqueId,
  effect,
  onCleanup,
  onMount,
  signal,
} from '@benosjs/core'
import { resource, Suspense } from '@benosjs/async'
import {
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
import { hydrate, type HydrationMismatch } from '@benosjs/dom/hydrate'
import { directTemplate } from '@benosjs/dom/internal'
import { renderToString } from '../src/index.js'

const roots: Array<() => void> = []
afterEach(() => {
  while (roots.length) roots.pop()?.()
  document.body.replaceChildren()
  vi.restoreAllMocks()
})

/** Elements and text, attributes sorted, form state through properties. */
function canon(node: Node): string {
  if (node.nodeType === Node.TEXT_NODE) return `#t(${node.textContent})`
  if (node.nodeType === Node.COMMENT_NODE)
    return `#c(${(node as Comment).data})`
  const element = node as Element
  const attrs = [...element.attributes]
    .filter((a) => a.name !== 'value' && a.name !== 'checked')
    .map((a) => `${a.name}=${JSON.stringify(a.value)}`)
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
  return `<${element.localName}${attrs ? ` ${attrs}` : ''}>${[...element.childNodes].map(canon).join('')}</${element.localName}>`
}

function shape(host: Element): string {
  return [...host.childNodes].map(canon).join('')
}

async function serve(
  app: () => Child,
  options: { rootId?: string } = {},
): Promise<HTMLDivElement> {
  const { html } = await renderToString(app, options)
  const host = document.createElement('div')
  document.body.append(host)
  host.innerHTML = html
  return host
}

function clientShape(app: () => Child): string {
  const host = document.createElement('div')
  roots.push(render(app, host))
  return shape(host)
}

const mismatches = (): HydrationMismatch[] => []

describe('hydrate', () => {
  it('claims server nodes, keeps identity, and leaves client-shaped DOM', async () => {
    const count = signal(2)
    const items = ['a', 'b']
    const app = () =>
      jsx('section', {
        children: [
          instantiate(
            {
              id: 't',
              nodes: [
                {
                  op: 'element',
                  tag: 'p',
                  slot: 0,
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
          jsx(For, {
            each: items,
            children: (item: () => string) => jsx('li', { children: item() }),
          }),
          jsx(Show, { when: false, children: 'hidden' }),
          jsx(Switch, {
            children: jsx(Match, {
              when: true,
              children: jsx('u', { children: 'm' }),
            }),
          }),
          jsx(ErrorBoundary, {
            fallback: 'oops',
            children: jsx('b', { children: 'ok' }),
          }),
        ],
      })
    const host = await serve(app)
    const before = {
      section: host.querySelector('section'),
      p: host.querySelector('p'),
      li: host.querySelector('li'),
      em: host.querySelector('em'),
    }
    const seen: HydrationMismatch[] = mismatches()
    roots.push(hydrate(app, host, { onMismatch: (info) => seen.push(info) }))
    expect(seen).toEqual([])
    expect(host.querySelector('section')).toBe(before.section)
    expect(host.querySelector('p')).toBe(before.p)
    expect(host.querySelector('li')).toBe(before.li)
    expect(host.querySelector('em')).toBe(before.em)
    expect(host.innerHTML).not.toMatch(/benos|<!--\/?[bi]/)
    expect(shape(host)).toBe(clientShape(app))
    count.set(5)
    expect(host.querySelector('p')?.textContent).toBe('Count: 5x')
    expect(host.querySelector('p')?.getAttribute('title')).toBe('n5')
  })

  it('installs delegated and native handlers once and batches their writes', async () => {
    const clicks: number[] = []
    const customs: number[] = []
    const app = () => {
      const n = signal(0)
      return jsx('button', {
        onClick: () => {
          n.set(n() + 1)
          n.set(n() + 1)
          clicks.push(n())
        },
        'on:custom': () => customs.push(1),
        get children() {
          return `n${n()}`
        },
      })
    }
    const host = await serve(app)
    roots.push(hydrate(app, host))
    const button = host.querySelector('button') as HTMLButtonElement
    button.click()
    button.click()
    button.dispatchEvent(new CustomEvent('custom'))
    expect(clicks).toEqual([2, 4])
    expect(customs).toEqual([1])
    expect(button.textContent).toBe('n4')
  })

  it('calls refs with the claimed element and runs effects and mounts after the claim', async () => {
    const seen: string[] = []
    let referenced: Element | null = null
    const app = () =>
      jsx(() => {
        effect(() => seen.push(`effect:${referenced?.isConnected}`))
        onMount(() => seen.push(`mount:${referenced?.isConnected}`))
        onCleanup(() => seen.push('cleanup'))
        return jsx('p', {
          ref: (el: Element) => (referenced = el),
          children: 'r',
        })
      }, {})
    const host = await serve(app)
    seen.length = 0 // the server render's own cleanup
    const p = host.querySelector('p')
    const dispose = hydrate(app, host)
    expect(referenced).toBe(p)
    expect(seen).toEqual(['effect:true', 'mount:true'])
    dispose()
    expect(seen).toEqual(['effect:true', 'mount:true', 'cleanup'])
    expect(host.childNodes).toHaveLength(0)
  })

  it('seeds resources from the payload without fetching and keeps the ids', async () => {
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
    let fetches = 0
    const app = () => {
      const user = resource(
        () => 7,
        () => {
          fetches++
          return Promise.resolve({ name: 'Ada', secret: 'hunter2' })
        },
        { ssr: codec },
      )
      const id = createUniqueId()
      return jsx(Suspense, {
        fallback: 'loading',
        children: jsx(
          () =>
            jsx('label', {
              for: id,
              children: jsx('b', {
                id,
                get children() {
                  return user.read()?.name
                },
              }),
            }),
          {},
        ),
      })
    }
    const host = await serve(app)
    const serverLabel = host.querySelector('label') as HTMLLabelElement
    const serverFor = serverLabel.getAttribute('for')
    expect(fetches).toBe(1)
    expect(host.querySelector('script[data-benos]')).not.toBeNull()
    roots.push(hydrate(app, host))
    await Promise.resolve()
    await Promise.resolve()
    expect(fetches).toBe(1)
    expect(host.querySelector('label')).toBe(serverLabel)
    expect(host.querySelector('label')?.getAttribute('for')).toBe(serverFor)
    expect(host.querySelector('b')?.textContent).toBe('Ada')
    expect(host.querySelector('script[data-benos]')).toBeNull()
    expect(host.textContent).not.toContain('loading')
  })

  it('shows the fallback and fetches when the payload is missing', async () => {
    let resolve!: (value: { name: string }) => void
    const codec = {
      id: 'user',
      key: (id: number) => String(id),
      serialize: (value: { name: string }) => value,
      deserialize: (value: unknown) => value as { name: string },
    }
    const app = () => {
      const user = resource(
        () => 1,
        () => new Promise<{ name: string }>((done) => (resolve = done)),
        { ssr: codec },
      )
      return jsx(Suspense, {
        fallback: jsx('i', { children: 'loading' }),
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
    }
    const { html } = await renderToString(() => {
      const user = resource(
        () => 1,
        () => Promise.resolve({ name: 'Ada' }),
        { ssr: codec },
      )
      return jsx(Suspense, {
        fallback: jsx('i', { children: 'loading' }),
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
    const host = document.createElement('div')
    document.body.append(host)
    host.innerHTML = html.replace(/<script[^>]*>.*<\/script>$/s, '')
    const serverB = host.querySelector('b')
    const seen: HydrationMismatch[] = []
    vi.spyOn(console, 'error').mockImplementation(() => undefined)
    roots.push(hydrate(app, host, { onMismatch: (info) => seen.push(info) }))
    // The pending content is held back when Suspense first tries to reveal.
    await Promise.resolve()
    expect(host.querySelectorAll('b')).toHaveLength(0)
    expect(host.textContent).toBe('loading')
    expect(seen.map((info) => info.recovered)).toEqual(['boundary'])
    resolve({ name: 'Grace' })
    await Promise.resolve()
    await Promise.resolve()
    await Promise.resolve()
    expect(host.querySelector('b')).toBe(serverB)
    expect(host.textContent).toBe('Grace')
  })

  it('recovers a tampered range inside one boundary and reports it', async () => {
    const app = () =>
      jsx('ul', {
        children: jsx(For, {
          each: ['a', 'b', 'c'],
          children: (item: () => string) => jsx('li', { children: item() }),
        }),
      })
    const host = await serve(app)
    const second = host.querySelectorAll('li')[1] as HTMLLIElement
    const bogus = document.createElement('div')
    bogus.textContent = 'b'
    second.replaceWith(bogus)
    const seen: HydrationMismatch[] = []
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    roots.push(hydrate(app, host, { onMismatch: (info) => seen.push(info) }))
    expect(seen).toHaveLength(1)
    expect(seen[0]).toMatchObject({
      rootId: '0',
      path: 'ul',
      expected: 'element <li>',
      actual: 'element <div>',
      recovered: 'boundary',
    })
    expect(error).toHaveBeenCalledTimes(1)
    expect(shape(host)).toBe(clientShape(app))
    expect(host.querySelectorAll('li')[0]).not.toBe(second)
  })

  it('client renders the whole app without root markers', async () => {
    const app = () => jsx('p', { children: 'x' })
    const host = document.createElement('div')
    document.body.append(host)
    const seen: HydrationMismatch[] = []
    vi.spyOn(console, 'error').mockImplementation(() => undefined)
    roots.push(hydrate(app, host, { onMismatch: (info) => seen.push(info) }))
    expect(seen[0]?.recovered).toBe('root')
    expect(host.innerHTML).toBe('<p>x</p>')
  })

  it('keeps input typed before hydration until the binding changes', async () => {
    const value = signal('server')
    const app = () =>
      jsx('input', {
        get value() {
          return value()
        },
      })
    const host = await serve(app)
    const input = host.querySelector('input') as HTMLInputElement
    expect(input.value).toBe('server')
    input.value = 'typed'
    roots.push(hydrate(app, host))
    expect(host.querySelector('input')).toBe(input)
    expect(input.value).toBe('typed')
    value.set('next')
    expect(input.value).toBe('next')
  })

  it('claims a direct template the server rendered as a plan', async () => {
    const count = signal(1)
    const serverApp = () =>
      instantiate(
        {
          id: 'd',
          nodes: [
            {
              op: 'element',
              tag: 'p',
              attrs: [['class', 'x']],
              children: [
                { op: 'text', value: 'Count: ' },
                { op: 'anchor', slot: 0 },
              ],
            },
          ],
        },
        (scope) => scope.child(0, () => count()),
      )
    const clientApp = () =>
      directTemplate(
        {
          id: 'd',
          html: '<p class="x">Count: <!----></p>',
          attributes: [],
          bindings: [
            {
              kind: 'child',
              path: [1],
              namespace: 'html',
              get: (values) => (values[0] as () => number)(),
            },
          ],
        },
        [() => count()],
      )
    const host = await serve(serverApp)
    const p = host.querySelector('p')
    roots.push(hydrate(clientApp, host))
    expect(host.querySelector('p')).toBe(p)
    expect(p?.textContent).toBe('Count: 1')
    count.set(3)
    expect(p?.textContent).toBe('Count: 3')
    expect(host.innerHTML).toBe('<p class="x">Count: 3<!----></p>')
  })

  it('hydrates two roots on one page and client renders portal content', async () => {
    const target = document.createElement('div')
    document.body.append(target)
    const one = () => jsx('b', { children: '1' })
    const two = () =>
      jsx('i', {
        children: [jsx(Portal, { mount: target, children: 'portal' }), '2'],
      })
    const first = await renderToString(one, { rootId: 'a' })
    const second = await renderToString(two, { rootId: 'b' })
    const host = document.createElement('div')
    document.body.append(host)
    host.innerHTML = first.html + second.html
    const b = host.querySelector('b')
    const i = host.querySelector('i')
    roots.push(hydrate(one, host, { rootId: 'a' }))
    roots.push(hydrate(two, host, { rootId: 'b' }))
    expect(host.querySelector('b')).toBe(b)
    expect(host.querySelector('i')).toBe(i)
    expect(shape(host)).toBe(clientShape(one) + clientShape(two))
    expect(target.textContent).toBe('portalportal')
  })
})
