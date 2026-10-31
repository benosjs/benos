// @vitest-environment happy-dom
// Progressive hydration: `hydrate` runs while patches are still arriving.
// A streamed boundary shows its claimed fallback and stages nothing; when
// its patch lands the content is inserted and claimed, with no fetch; the
// end notice turns the rest into ordinary client renders.
import { afterEach, describe, expect, it, vi } from 'vitest'
import { resource, Suspense } from '@benosjs/async'
import { jsx, type Child } from '@benosjs/dom'
import { hydrate, type HydrationMismatch } from '@benosjs/dom/hydrate'
import { renderToStream, renderToString } from '../src/index.js'

const roots: Array<() => void> = []
/** The page is still parsing while patches arrive. */
function parsing(state: 'loading' | 'complete'): void {
  Object.defineProperty(document, 'readyState', {
    configurable: true,
    get: () => state,
  })
}
afterEach(() => {
  parsing('complete')
  while (roots.length) roots.pop()?.()
  document.body.replaceChildren()
  delete (window as unknown as { __benos_s?: unknown }).__benos_s
  vi.restoreAllMocks()
})

const decoder = new TextDecoder()
const codec = {
  id: 'user',
  key: (id: number) => String(id),
  serialize: (user: { name: string; secret: string }) => ({ name: user.name }),
  deserialize: (raw: unknown) => ({ ...(raw as { name: string }), secret: '' }),
}
const teamCodec = { ...codec, id: 'team' }

function deferred<T>(): { promise: Promise<T>; resolve: (value: T) => void } {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((done) => {
    resolve = done
  })
  return { promise, resolve }
}

/** Reads every chunk; the caller settles data between `onShell` and the rest. */
async function chunksOf(
  app: () => Child,
  onShell: () => void,
): Promise<string[]> {
  const result = await renderToStream(app)
  const reader = result.stream.getReader()
  const chunks: string[] = []
  for (;;) {
    const { value, done } = await reader.read()
    if (done) break
    chunks.push(decoder.decode(value))
    if (chunks.length === 1) onShell()
  }
  await result.done
  return chunks
}

/** Appends a chunk to the host and runs its inline scripts, as a parser would. */
function write(host: HTMLElement, chunk: string): void {
  const template = document.createElement('template')
  template.innerHTML = chunk
  const nodes = [...template.content.childNodes]
  host.append(...nodes)
  for (const node of nodes) {
    if (node instanceof HTMLScriptElement && node.type !== 'application/json') {
      const code = node.textContent
        .replace(/;document\.currentScript\.remove\(\)/g, '')
        .replace(
          /document\.currentScript&&document\.currentScript\.remove\(\)/g,
          '',
        )
      new Function('self', 'document', 'window', code)(window, document, window)
      node.remove()
    }
  }
}

function shape(host: Element): string {
  const clone = host.cloneNode(true) as Element
  for (const script of clone.querySelectorAll('script')) script.remove()
  return clone.innerHTML
}

const tick = (ms = 0): Promise<void> =>
  new Promise((done) => setTimeout(done, ms))

interface Harness {
  app: () => Child
  fetches: () => number
  settle: (name: string) => void
}

function userHarness(fail = false): Harness {
  let fetches = 0
  let pending: ((user: { name: string; secret: string }) => void) | null = null
  const app = (): Child => {
    const user = resource(
      () => 7,
      () => {
        fetches++
        if (fail) return Promise.reject(new Error('down'))
        return new Promise<{ name: string; secret: string }>((resolve) => {
          pending = resolve
        })
      },
      { ssr: codec },
    )
    return jsx('main', {
      children: [
        jsx('input', { id: 'field', value: 'server' }),
        jsx(Suspense, {
          fallback: jsx('p', { id: 'loading', children: 'loading' }),
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
        }),
      ],
    })
  }
  return {
    app,
    fetches: () => fetches,
    settle: (name) => {
      fail = false
      pending?.({ name, secret: 'hunter2' })
      pending = null
    },
  }
}

describe('progressive hydration', () => {
  it('hydrates before the patch: claimed fallback, no fetch, then claims the patched content', async () => {
    const server = userHarness()
    const chunks = await chunksOf(server.app, () => server.settle('Ada'))
    expect(chunks).toHaveLength(3)
    const host = document.createElement('div')
    document.body.append(host)
    write(host, chunks[0] as string)
    // The user types before hydration.
    const field = host.querySelector<HTMLInputElement>(
      '#field',
    ) as HTMLInputElement
    field.value = 'typed'
    const loading = host.querySelector('#loading')
    const client = userHarness()
    const mismatches: HydrationMismatch[] = []
    parsing('loading')
    roots.push(
      hydrate(client.app, host, {
        onMismatch: (info) => mismatches.push(info),
      }),
    )
    await tick()
    // Nothing fetched, the fallback is the claimed node, no content exists.
    expect(client.fetches()).toBe(0)
    expect(host.querySelector('#loading')).toBe(loading)
    expect(host.querySelector('#name')).toBeNull()
    // The patch arrives.
    write(host, chunks[1] as string)
    await tick()
    const name = host.querySelector('#name')
    expect(name?.textContent).toBe('Ada')
    expect(host.querySelector('#loading')).toBeNull()
    expect(client.fetches()).toBe(0)
    expect(host.querySelector('template')).toBeNull()
    // The content node is the one the patch carried, claimed in place.
    expect(host.innerHTML).not.toContain('b:0:')
    write(host, chunks[2] as string)
    await tick()
    expect(host.querySelector('#name')).toBe(name)
    expect(client.fetches()).toBe(0)
    expect(mismatches).toEqual([])
    expect((host.querySelector('#field') as HTMLInputElement).value).toBe(
      'typed',
    )
    // Same DOM as hydrating the fully applied page (one hydration per root
    // id at a time: dispose the first so its handler releases the id).
    const streamedShape = shape(host).replace('typed', 'server')
    roots.pop()?.()
    const reference = document.createElement('div')
    document.body.append(reference)
    for (const chunk of chunks) write(reference, chunk)
    roots.push(hydrate(userHarness().app, reference))
    await tick()
    expect(streamedShape).toBe(shape(reference))
  })

  it('hydrates after all patches through the unchanged path', async () => {
    const server = userHarness()
    const chunks = await chunksOf(server.app, () => server.settle('Ada'))
    const host = document.createElement('div')
    document.body.append(host)
    for (const chunk of chunks) write(host, chunk)
    const name = host.querySelector('#name')
    const client = userHarness()
    const mismatches: HydrationMismatch[] = []
    roots.push(
      hydrate(client.app, host, {
        onMismatch: (info) => mismatches.push(info),
      }),
    )
    await tick()
    expect(host.querySelector('#name')).toBe(name)
    expect(client.fetches()).toBe(0)
    expect(mismatches).toEqual([])
  })

  it('turns a boundary the end notice leaves unpatched into one client fetch', async () => {
    const server = userHarness(true)
    const chunks = await chunksOf(server.app, () => undefined)
    expect(chunks).toHaveLength(2)
    const host = document.createElement('div')
    document.body.append(host)
    write(host, chunks[0] as string)
    const client = userHarness()
    parsing('loading')
    const mismatches: HydrationMismatch[] = []
    roots.push(
      hydrate(client.app, host, {
        onMismatch: (info) => mismatches.push(info),
      }),
    )
    await tick()
    expect(client.fetches()).toBe(0)
    expect(host.querySelector('#loading')).not.toBeNull()
    write(host, chunks[1] as string)
    await tick()
    expect(client.fetches()).toBe(1)
    expect(host.querySelector('#loading')).not.toBeNull()
    client.settle('Client')
    await tick()
    expect(host.querySelector('#name')?.textContent).toBe('Client')
    expect(host.querySelector('#loading')).toBeNull()
    expect(mismatches).toEqual([])
  })

  it('a hydration that starts after the stream finished fetches at once', async () => {
    const server = userHarness(true)
    const chunks = await chunksOf(server.app, () => undefined)
    const host = document.createElement('div')
    document.body.append(host)
    for (const chunk of chunks) write(host, chunk)
    const client = userHarness()
    roots.push(hydrate(client.app, host))
    await tick()
    expect(client.fetches()).toBe(1)
  })

  it('hydrates between the patches of nested boundaries', async () => {
    const build = (
      user: () => Promise<{ name: string; secret: string }>,
      team: () => Promise<{ name: string; secret: string }>,
    ): (() => Child) => {
      return () => {
        const u = resource(() => 1, user, { ssr: codec })
        const t = resource(() => 2, team, { ssr: teamCodec })
        return jsx(Suspense, {
          fallback: 'outer loading',
          children: jsx(
            () => [
              jsx('b', {
                id: 'user',
                get children() {
                  return u.read()?.name
                },
              }),
              jsx(Suspense, {
                fallback: 'inner loading',
                children: jsx(
                  () =>
                    jsx('i', {
                      id: 'team',
                      get children() {
                        return t.read()?.name
                      },
                    }),
                  {},
                ),
              }),
            ],
            {},
          ),
        })
      }
    }
    const outer = deferred<{ name: string; secret: string }>()
    const inner = deferred<{ name: string; secret: string }>()
    const chunks: string[] = []
    const result = await renderToStream(
      build(
        () => outer.promise,
        () => inner.promise,
      ),
    )
    const reader = result.stream.getReader()
    chunks.push(decoder.decode((await reader.read()).value))
    outer.resolve({ name: 'Ada', secret: '' })
    chunks.push(decoder.decode((await reader.read()).value))
    inner.resolve({ name: 'Core', secret: '' })
    for (;;) {
      const { value, done } = await reader.read()
      if (done) break
      chunks.push(decoder.decode(value))
    }
    expect(chunks).toHaveLength(4)
    const host = document.createElement('div')
    document.body.append(host)
    // Shell and the outer patch are applied by the runtime before hydration.
    write(host, chunks[0] as string)
    write(host, chunks[1] as string)
    let fetches = 0
    const counting = (name: string) => () => {
      fetches++
      return Promise.resolve({ name, secret: '' })
    }
    const user = host.querySelector('#user')
    expect(user?.textContent).toBe('Ada')
    const mismatches: HydrationMismatch[] = []
    parsing('loading')
    roots.push(
      hydrate(build(counting('Ada'), counting('Core')), host, {
        onMismatch: (info) => mismatches.push(info),
      }),
    )
    await tick()
    expect(fetches).toBe(0)
    expect(host.querySelector('#user')).toBe(user)
    expect(host.querySelector('#team')).toBeNull()
    expect(host.textContent).toContain('inner loading')
    // The inner patch lands during hydration.
    write(host, chunks[2] as string)
    write(host, chunks[3] as string)
    await tick()
    expect(host.querySelector('#team')?.textContent).toBe('Core')
    expect(host.textContent).not.toContain('loading')
    expect(fetches).toBe(0)
    expect(mismatches).toEqual([])
    const { html } = await renderToString(
      build(
        () => Promise.resolve({ name: 'Ada', secret: '' }),
        () => Promise.resolve({ name: 'Core', secret: '' }),
      ),
    )
    const reference = document.createElement('div')
    reference.innerHTML = html
    roots.push(
      hydrate(
        build(
          () => Promise.resolve({ name: 'Ada', secret: '' }),
          () => Promise.resolve({ name: 'Core', secret: '' }),
        ),
        reference,
      ),
    )
    await tick()
    expect(shape(host)).toBe(shape(reference))
  })

  it('treats the end of parsing without an end notice as the end of the stream', async () => {
    const server = userHarness()
    const chunks = await chunksOf(server.app, () => server.settle('Ada'))
    const host = document.createElement('div')
    document.body.append(host)
    write(host, chunks[0] as string)
    const client = userHarness()
    parsing('loading')
    roots.push(hydrate(client.app, host))
    await tick()
    expect(client.fetches()).toBe(0)
    // The connection dropped: parsing ends with no further chunk.
    parsing('complete')
    document.dispatchEvent(new Event('DOMContentLoaded'))
    await tick()
    expect(client.fetches()).toBe(1)
    client.settle('Client')
    await tick()
    expect(host.querySelector('#name')?.textContent).toBe('Client')
  })

  it('ignores a patch for a boundary that was already disposed and leaks nothing', async () => {
    const server = userHarness()
    const chunks = await chunksOf(server.app, () => server.settle('Ada'))
    const host = document.createElement('div')
    document.body.append(host)
    write(host, chunks[0] as string)
    const client = userHarness()
    parsing('loading')
    const dispose = hydrate(client.app, host)
    await tick()
    dispose()
    expect(host.childNodes.length).toBe(0)
    // Patches after disposal are dropped and leave no template behind.
    write(host, chunks[1] as string)
    write(host, chunks[2] as string)
    await tick()
    expect(host.querySelector('template')).toBeNull()
    expect(host.querySelector('#name')).toBeNull()
    expect(client.fetches()).toBe(0)
  })
})
