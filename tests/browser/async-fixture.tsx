import { effect, onMount, signal } from '@benosjs/core'
import { ErrorBoundary, render } from '@benosjs/dom'
import { resource, startTransition, Suspense } from '@benosjs/async'

const host = document.querySelector<HTMLElement>('#app')
if (!host) throw new Error('Async fixture host is missing')
const key = signal('A')
const requests = new Map<
  string,
  { resolve: (value: string) => void; reject: (error: Error) => void }
>()
const events: string[] = []
let dispose: (() => void) | null = null

function Content(): JSX.Element {
  const data = resource(
    key,
    (next) =>
      new Promise<string>((resolve, reject) =>
        requests.set(next, { resolve, reject }),
      ),
  )
  effect(() => events.push(`effect:${key()}`))
  onMount(() => events.push(`mount:${key()}`))
  return <p id="content">{data.read()}</p>
}

function mount(): void {
  dispose?.()
  events.length = 0
  host.replaceChildren()
  dispose = render(
    () => (
      <ErrorBoundary fallback={<span id="error">Failed</span>}>
        <Suspense fallback={<span id="fallback">Loading</span>}>
          <Content />
        </Suspense>
      </ErrorBoundary>
    ),
    host,
  )
}

function mountNested(): void {
  dispose?.()
  host.replaceChildren()
  function Inner(): JSX.Element {
    const data = resource(
      () => 'inner',
      (next) =>
        new Promise<string>((resolve, reject) =>
          requests.set(next, { resolve, reject }),
        ),
    )
    return <b id="inner-content">{data.read()}</b>
  }
  dispose = render(
    () => (
      <Suspense fallback="outer wait">
        <section>
          shell
          <Suspense fallback={<i id="inner-fallback">inner wait</i>}>
            <Inner />
          </Suspense>
        </section>
      </Suspense>
    ),
    host,
  )
}

function mountDirectNested(): void {
  dispose?.()
  host.replaceChildren()
  function Inner(): JSX.Element {
    const data = resource(
      () => 'direct-inner',
      (next) =>
        new Promise<string>((resolve, reject) =>
          requests.set(next, { resolve, reject }),
        ),
    )
    return <b id="direct-inner-content">{data.read()}</b>
  }
  dispose = render(
    () => (
      <Suspense fallback="outer wait">
        <Suspense fallback={<i id="direct-inner-fallback">inner wait</i>}>
          <Inner />
        </Suspense>
      </Suspense>
    ),
    host,
  )
}

function update(next: string): void {
  key.set(next)
}

async function resolve(keyName: string, value: string): Promise<void> {
  requests.get(keyName)?.resolve(value)
  await Promise.resolve()
  await new Promise((done) => setTimeout(done, 0))
}

async function reject(keyName: string): Promise<void> {
  requests.get(keyName)?.reject(new Error(`failed ${keyName}`))
  await Promise.resolve()
  await new Promise((done) => setTimeout(done, 0))
}

async function transition(next: string): Promise<void> {
  await startTransition(() => key.set(next))
}

declare global {
  interface Window {
    __benosAsync?: {
      mount: typeof mount
      mountNested: typeof mountNested
      mountDirectNested: typeof mountDirectNested
      update: typeof update
      resolve: typeof resolve
      reject: typeof reject
      transition: typeof transition
      events: typeof events
    }
  }
}

window.__benosAsync = {
  mount,
  mountNested,
  mountDirectNested,
  update,
  resolve,
  reject,
  transition,
  events,
}
