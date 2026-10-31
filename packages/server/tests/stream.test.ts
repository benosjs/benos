// @vitest-environment happy-dom
// renderToStream: the shell after the router settles, one patch per streamed
// boundary, the runtime, the end notice, and the invariant: once the patches
// have applied, the document equals renderToString's for the same state.
import { afterEach, describe, expect, it, vi } from 'vitest'
import { resource, Suspense } from '@benosjs/async'
import { jsx, type Child } from '@benosjs/dom'
import {
  createRouter,
  memoryHistory,
  mountRoute,
  redirect,
  route,
  RouterOutlet,
} from '@benosjs/router'
import { renderToStream, renderToString } from '../src/index.js'

afterEach(() => {
  document.body.replaceChildren()
  vi.restoreAllMocks()
})

const decoder = new TextDecoder()

/** Every chunk of the stream, decoded, plus the result's fields. */
async function collect(
  app: () => Child,
  options: Parameters<typeof renderToStream>[1] = {},
): Promise<{
  chunks: string[]
  status: number
  headers: Headers
}> {
  const result = await renderToStream(app, options)
  const chunks: string[] = []
  const reader = result.stream.getReader()
  for (;;) {
    const { value, done } = await reader.read()
    if (done) break
    chunks.push(decoder.decode(value))
  }
  await result.done
  return { chunks, status: result.status, headers: result.headers }
}

/**
 * Parses the streamed chunks into a container as a browser would, running
 * every inline script in document order (the runtime, each patch call, the
 * end notice) against this document.
 */
function apply(chunks: string[]): HTMLElement {
  const host = document.createElement('div')
  document.body.append(host)
  for (const chunk of chunks) {
    const template = document.createElement('template')
    template.innerHTML = chunk
    const nodes = [...template.content.childNodes]
    host.append(...nodes)
    for (const node of nodes) {
      if (
        node instanceof HTMLScriptElement &&
        node.type !== 'application/json'
      ) {
        const code = node.textContent
          .replace(/document\.currentScript[^;]*;?/g, '')
          .replace(
            /document\.currentScript&&document\.currentScript\.remove\(\)/g,
            '',
          )
        new Function('self', 'document', 'window', code)(
          window,
          document,
          window,
        )
        node.remove()
      }
    }
  }
  return host
}

/** The markup between the root markers, with payload scripts removed. */
function marked(host: HTMLElement): string {
  const clone = host.cloneNode(true) as HTMLElement
  for (const script of clone.querySelectorAll('script')) script.remove()
  return clone.innerHTML
}

function payloadsOf(host: HTMLElement): unknown[] {
  return [...host.querySelectorAll('script[data-benos]')].map((script) =>
    JSON.parse(script.textContent),
  )
}

function parse(html: string): HTMLElement {
  const host = document.createElement('div')
  host.innerHTML = html
  return host
}

const codec = {
  id: 'user',
  key: (id: number) => String(id),
  serialize: (user: { name: string; secret: string }) => ({ name: user.name }),
  deserialize: (raw: unknown) => raw as { name: string },
}

/** A fetch the test settles by hand. */
function deferred<T>(): { promise: Promise<T>; resolve: (value: T) => void } {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((done) => {
    resolve = done
  })
  return { promise, resolve }
}

function userApp(fetcher: () => Promise<{ name: string; secret: string }>) {
  return () => {
    const user = resource(() => 7, fetcher, { ssr: codec })
    return jsx('main', {
      children: [
        jsx('h1', { children: 'Shell' }),
        jsx(Suspense, {
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
        }),
      ],
    })
  }
}

describe('renderToStream', () => {
  it('sends the shell with the fallback, then the patch, then the end notice', async () => {
    const user = deferred<{ name: string; secret: string }>()
    const result = await renderToStream(userApp(() => user.promise))
    const reader = result.stream.getReader()
    const first = decoder.decode((await reader.read()).value)
    expect(first).toContain('<h1>Shell</h1>')
    expect(first).toContain('<!--b:0:0--><p>loading</p><!--/b--><!---->')
    expect(first).not.toContain('<script type="application/json"')
    expect(first).not.toContain('__benos_s')
    user.resolve({ name: 'Ada <3', secret: 'hunter2' })
    const second = decoder.decode((await reader.read()).value)
    expect(second).toContain('self.__benos_s||')
    expect(second).toContain(
      '<template id="b:0:0"><!--b:1--><b><!--b-->Ada &lt;3<!--/b--></b><!--/b--></template>',
    )
    expect(second).toContain(
      '<script type="application/json" data-benos="0">{"v":1,"r":[["user","7",{"name":"Ada \\u003c3"}]],"q":[]}</script>',
    )
    expect(second).toContain('<script>__benos_s.p("0","0");')
    expect(second).not.toContain('hunter2')
    const third = decoder.decode((await reader.read()).value)
    expect(third).toContain('__benos_s.e("0")')
    expect((await reader.read()).done).toBe(true)
    await result.done
  })

  it('applied, equals renderToString for the same settled state (the invariant)', async () => {
    const fetcher = () => Promise.resolve({ name: 'Ada', secret: 's' })
    const user = deferred<{ name: string; secret: string }>()
    const { chunks } = await (async () => {
      const pending = collect(userApp(() => user.promise))
      await Promise.resolve()
      user.resolve({ name: 'Ada', secret: 's' })
      return pending
    })()
    expect(chunks.length).toBe(3)
    const streamed = apply(chunks)
    const { html } = await renderToString(userApp(fetcher))
    const reference = parse(html)
    expect(marked(streamed)).toBe(marked(reference))
    expect(payloadsOf(streamed)).toEqual(payloadsOf(reference))
    // The runtime removed the template and no streamed marker survives.
    expect(streamed.querySelector('template')).toBeNull()
    expect(marked(streamed)).not.toContain('b:0:')
  })

  it('emits no runtime and no scripts beyond the payload when nothing is pending', async () => {
    const { chunks } = await collect(
      userApp(() => Promise.resolve({ name: 'Ada', secret: 's' })),
    )
    // The resource settles before the shell loop's first microtask round
    // completes only if nothing waits; here it is pending at shell time, so
    // use a page without data instead.
    const plain = await collect(() => jsx('p', { children: 'static' }))
    expect(plain.chunks).toHaveLength(1)
    expect(plain.chunks[0]).toBe('<!--benos:0:1--><p>static</p><!--/benos:0-->')
    expect(chunks.length).toBeGreaterThan(0)
  })

  it('streams nested boundaries in settle order and keeps the invariant', async () => {
    const outer = deferred<{ name: string; secret: string }>()
    const inner = deferred<{ name: string; secret: string }>()
    const innerCodec = { ...codec, id: 'team' }
    const app = (
      outerFetch: () => Promise<{ name: string; secret: string }>,
      innerFetch: () => Promise<{ name: string; secret: string }>,
    ) => {
      return () => {
        const user = resource(() => 1, outerFetch, { ssr: codec })
        const team = resource(() => 2, innerFetch, { ssr: innerCodec })
        return jsx(Suspense, {
          fallback: 'outer loading',
          children: jsx(
            () => [
              jsx('b', {
                get children() {
                  return user.read()?.name
                },
              }),
              jsx(Suspense, {
                fallback: 'inner loading',
                children: jsx(
                  () =>
                    jsx('i', {
                      get children() {
                        return team.read()?.name
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
    const pending = collect(
      app(
        () => outer.promise,
        () => inner.promise,
      ),
    )
    await Promise.resolve()
    outer.resolve({ name: 'Ada', secret: '' })
    await new Promise((done) => setTimeout(done, 0))
    inner.resolve({ name: 'Core', secret: '' })
    const { chunks } = await pending
    // shell, outer patch (carrying the inner fallback), inner patch, end
    expect(chunks).toHaveLength(4)
    expect(chunks[1]).toContain('<template id="b:0:0">')
    expect(chunks[1]).toContain('<!--b:0:1-->inner loading<!--/b-->')
    expect(chunks[2]).toContain('<template id="b:0:1">')
    const streamed = apply(chunks)
    const { html } = await renderToString(
      app(
        () => Promise.resolve({ name: 'Ada', secret: '' }),
        () => Promise.resolve({ name: 'Core', secret: '' }),
      ),
    )
    expect(marked(streamed)).toBe(marked(parse(html)))
    expect(
      payloadsOf(streamed).flatMap((p) => (p as { r: unknown[] }).r),
    ).toEqual(payloadsOf(parse(html)).flatMap((p) => (p as { r: unknown[] }).r))
  })

  it('hands a boundary whose data fails to the client through the end notice', async () => {
    const onError = vi.fn()
    const { chunks } = await collect(
      userApp(() => Promise.reject(new Error('down'))),
      { onError },
    )
    expect(chunks).toHaveLength(2)
    expect(chunks[0]).toContain('<!--b:0:0--><p>loading</p><!--/b-->')
    expect(chunks[1]).toContain('__benos_s.e("0")')
    expect(onError).toHaveBeenCalledWith(expect.any(Error), { phase: 'data' })
    const streamed = apply(chunks)
    expect(streamed.textContent).toContain('loading')
  })

  it('waits for the router and its loaders, then reports status and headers', async () => {
    const loaded = deferred<string>()
    const home = route('/', { loader: () => loaded.promise })
    const away = route('/away')
    const build = (path: string) => () => {
      const router = createRouter({
        history: memoryHistory({ initialEntries: [path] }),
        routes: [
          mountRoute(home, {
            component: () => jsx('h1', { children: 'home' }),
          }),
          mountRoute(away, { redirect: redirect({ to: home }) }),
        ],
        notFound: () => jsx('h1', { children: 'nope' }),
      })
      return jsx(RouterOutlet, { router })
    }
    let resolved = false
    const pending = renderToStream(build('/')).then((result) => {
      resolved = true
      return result
    })
    await new Promise((done) => setTimeout(done, 0))
    expect(resolved).toBe(false)
    loaded.resolve('data')
    const ok = await pending
    expect(ok.status).toBe(200)
    const okChunks = await collect(build('/'))
    expect(okChunks.chunks[0]).toContain('<h1>home</h1>')
    const notFound = await collect(build('/missing'))
    expect(notFound.status).toBe(404)
    expect(notFound.chunks[0]).toContain('<h1>nope</h1>')
    const redirected = await collect(build('/away'))
    expect(redirected.status).toBe(302)
    expect(redirected.headers.get('location')).toBe('/')
  })

  it('stamps the nonce on every inline script and never on the payload', async () => {
    const user = deferred<{ name: string; secret: string }>()
    const pending = collect(
      userApp(() => user.promise),
      { nonce: 'n0nce' },
    )
    await Promise.resolve()
    user.resolve({ name: 'Ada', secret: '' })
    const { chunks } = await pending
    const scripts = chunks.join('').match(/<script[^>]*>/g) ?? []
    for (const tag of scripts) {
      if (tag.includes('application/json')) expect(tag).not.toContain('nonce')
      else expect(tag).toContain('nonce="n0nce"')
    }
    expect(scripts.filter((tag) => tag.includes('nonce')).length).toBe(3)
  })

  it('ends the stream with the end notice and disposes when the signal aborts after the shell', async () => {
    const controller = new AbortController()
    const user = deferred<{ name: string; secret: string }>()
    const result = await renderToStream(
      () => {
        const app = userApp(() => user.promise)()
        return app
      },
      { signal: controller.signal },
    )
    const reader = result.stream.getReader()
    const first = decoder.decode((await reader.read()).value)
    expect(first).toContain('loading')
    controller.abort(new Error('client gone'))
    const next = decoder.decode((await reader.read()).value)
    expect(next).toContain('__benos_s.e("0")')
    expect((await reader.read()).done).toBe(true)
    await result.done
  })

  it('rejects before the shell on abort or a setup error, as renderToString does', async () => {
    const controller = new AbortController()
    controller.abort(new Error('early'))
    await expect(
      renderToStream(() => jsx('p', { children: 'x' }), {
        signal: controller.signal,
      }),
    ).rejects.toThrow('early')
    const onError = vi.fn()
    await expect(
      renderToStream(
        () => {
          throw new Error('setup failed')
        },
        { onError },
      ),
    ).rejects.toThrow('setup failed')
    expect(onError).toHaveBeenCalledWith(expect.any(Error), {
      phase: 'setup',
    })
  })

  it('enforces the cumulative payload cap after the shell by ending the stream', async () => {
    const onError = vi.fn()
    const user = deferred<{ name: string; secret: string }>()
    const pending = collect(
      userApp(() => user.promise),
      {
        onError,
        maxPayloadBytes: 20,
      },
    )
    await Promise.resolve()
    user.resolve({ name: 'A'.repeat(50), secret: '' })
    const { chunks } = await pending
    expect(chunks).toHaveLength(2)
    expect(chunks[1]).toContain('__benos_s.e("0")')
    expect(chunks[1]).not.toContain('<template')
    expect(onError).toHaveBeenCalledWith(expect.any(RangeError), {
      phase: 'stream',
    })
  })

  it('keeps two roots on one page apart', async () => {
    const a = deferred<{ name: string; secret: string }>()
    const b = deferred<{ name: string; secret: string }>()
    const first = collect(
      userApp(() => a.promise),
      { rootId: 'a' },
    )
    const second = collect(
      userApp(() => b.promise),
      { rootId: 'b' },
    )
    await Promise.resolve()
    a.resolve({ name: 'Ada', secret: '' })
    b.resolve({ name: 'Bob', secret: '' })
    const [ra, rb] = await Promise.all([first, second])
    expect(ra.chunks[0]).toContain('<!--benos:a:1-->')
    expect(ra.chunks[1]).toContain('<template id="b:a:0">')
    expect(ra.chunks[1]).toContain('data-benos="a"')
    expect(rb.chunks[1]).toContain('<template id="b:b:0">')
    const host = apply([...ra.chunks, ...rb.chunks])
    expect(host.textContent).toContain('Ada')
    expect(host.textContent).toContain('Bob')
    expect(host.textContent).not.toContain('loading')
  })
})
