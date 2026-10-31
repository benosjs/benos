// A streamed page, parsed by the real browser parser as it arrives: the
// server renderer runs here (Web APIs only), its chunks are written into an
// iframe's document one by one so inline scripts run as the parser meets
// them, and the page is then hydrated through the unchanged claim code.
import { signal } from '@benosjs/core'
import { resource, Suspense } from '@benosjs/async'
import { jsx, type Child } from '@benosjs/dom'
import { hydrate, type HydrationMismatch } from '@benosjs/dom/hydrate'
import { renderToStream, renderToString } from '@benosjs/server'

declare global {
  interface Window {
    __benosStream: {
      run(mode: 'end' | 'before' | 'wait' | 'fail'): Promise<{
        chunks: number
        shellText: string
        finalText: string
        reference: string
        streamedHtml: string
        mismatches: HydrationMismatch[]
        fetches: number
        clientFetches: number
        count: string
        templates: number
        scripts: number
      }>
    }
  }
}

const codec = {
  id: 'user',
  key: (id: number) => String(id),
  serialize: (user: { name: string; secret: string }) => ({ name: user.name }),
  deserialize: (raw: unknown) => ({ ...(raw as { name: string }), secret: '' }),
}

const count = signal(1)
let fetches = 0
let pendingResolve: ((user: { name: string; secret: string }) => void) | null =
  null
let fail = false

function app(): Child {
  const user = resource(
    () => 7,
    () => {
      fetches++
      if (fail) return Promise.reject(new Error('down'))
      return new Promise<{ name: string; secret: string }>((resolve) => {
        pendingResolve = resolve
      })
    },
    { ssr: codec },
  )
  return jsx('main', {
    children: [
      jsx('p', {
        id: 'count',
        get children() {
          return `Count: ${count()}`
        },
      }),
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

/** Serializes the host's children with every comment kept, for comparison. */
function shape(host: Element): string {
  const clone = host.cloneNode(true) as Element
  for (const script of clone.querySelectorAll('script')) script.remove()
  return clone.innerHTML
}

window.__benosStream = {
  async run(mode) {
    fail = mode === 'fail'
    count.set(1)
    fetches = 0
    pendingResolve = null
    const result = await renderToStream(app)
    const reader = result.stream.getReader()
    const decoder = new TextDecoder()
    const iframe = document.createElement('iframe')
    document.body.append(iframe)
    const doc = iframe.contentDocument as Document
    const mismatches: HydrationMismatch[] = []
    let hydrated = false
    let clientFetchesBefore = 0
    const startHydration = (): void => {
      hydrated = true
      clientFetchesBefore = fetches
      hydrate(app, doc.getElementById('app') as HTMLElement, {
        onMismatch: (info) => mismatches.push(info),
      })
    }
    doc.open()
    doc.write('<!doctype html><html><body><div id="app">')
    // 'wait': the entry ran before the shell arrived; hydrate waits for it.
    if (mode === 'wait') startHydration()
    let chunks = 0
    let shellText = ''
    for (;;) {
      const { value, done } = await reader.read()
      if (done) break
      const chunk = decoder.decode(value)
      chunks++
      doc.write(chunk)
      if (chunks === 1) {
        shellText = (doc.getElementById('app') as HTMLElement).textContent ?? ''
        // 'before': hydrate while the data is still pending on the server.
        if (mode === 'before') {
          startHydration()
          await new Promise((done) => setTimeout(done, 20))
        }
        if (!fail) pendingResolve?.({ name: 'Ada', secret: 'hunter2' })
      }
    }
    doc.write('</div></body></html>')
    doc.close()
    await result.done
    const host = doc.getElementById('app') as HTMLElement
    const streamedHtml = shape(host)
    // What renderToString produces for the same settled state.
    const stringFetches = fetches
    const reference = await (async () => {
      const settle = renderToString(app)
      await Promise.resolve()
      if (!fail) pendingResolve?.({ name: 'Ada', secret: 'hunter2' })
      const { html } = await settle
      const holder = document.createElement('div')
      holder.innerHTML = html
      return shape(holder)
    })()
    fetches = stringFetches
    // The server could not settle the data; the client can.
    fail = false
    if (!hydrated) startHydration()
    await new Promise((done) => setTimeout(done, 20))
    if (mode === 'fail') pendingResolve?.({ name: 'Client', secret: '' })
    await new Promise((done) => setTimeout(done, 20))
    // A write after hydration reaches the claimed node: the binding is live.
    count.set(count() + 1)
    await new Promise((done) => setTimeout(done, 0))
    return {
      chunks,
      shellText,
      finalText: host.textContent ?? '',
      reference,
      streamedHtml,
      mismatches,
      fetches: clientFetchesBefore,
      clientFetches: fetches - clientFetchesBefore,
      count: host.querySelector('#count')?.textContent ?? '',
      templates: doc.querySelectorAll('template').length,
      scripts: doc.querySelectorAll('script:not([type="application/json"])')
        .length,
    }
  },
}
