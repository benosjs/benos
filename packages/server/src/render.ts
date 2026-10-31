import { createRoot } from '@benosjs/core'
import {
  createInternalOwner,
  runWithOwner,
  internalRequest,
  setInternalOwnerGate,
  type InternalRequest,
} from '@benosjs/core/internal'
import type { Child } from '@benosjs/dom'
import { mountValue, setTearingDown } from './host.js'
import { fragment, type SFragment } from './nodes.js'
import { serializeChildren, validateStructure } from './serialize.js'

export interface RenderOptions {
  /** Distinguishes roots on one page: `[A-Za-z0-9_-]{1,32}`; default `"0"`. */
  rootId?: string
  signal?: AbortSignal
  onError?: (error: unknown, info: { phase: 'setup' | 'data' }) => void
  /** UTF-8 bytes allowed for the payload JSON; default 1 MiB. */
  maxPayloadBytes?: number
}

export interface RenderResult {
  /** The root's markup with hydration markers and its payload script. */
  html: string
  /** The payload JSON alone, for custom placement. */
  payload: string
  /** 200, or what the router set. */
  status: number
  /** `Location` for a router redirect; otherwise empty. */
  headers: Headers
}

const development = process.env.NODE_ENV !== 'production'

/** JSON that is inert inside `<script>`, with the values checked. */
export function stringifyPayload(value: unknown, label: () => string): string {
  const seen = new Set<object>()
  const check = (item: unknown): void => {
    if (item === null) return
    const type = typeof item
    if (type === 'string' || type === 'boolean') return
    if (type === 'number') {
      if (!Number.isFinite(item))
        throw new TypeError(`${label()} serialized a non-finite number`)
      return
    }
    if (type !== 'object')
      throw new TypeError(`${label()} serialized a ${type}`)
    const object = item as object
    if (seen.has(object)) throw new TypeError(`${label()} serialized a cycle`)
    seen.add(object)
    if (Array.isArray(object)) {
      for (let index = 0; index < object.length; index++) {
        if (!(index in object))
          throw new TypeError(`${label()} serialized a sparse array`)
        check(object[index])
      }
    } else {
      if (Object.getPrototypeOf(object) !== Object.prototype)
        throw new TypeError(`${label()} serialized a non-plain object`)
      for (const entry of Object.values(object)) check(entry)
    }
    seen.delete(object)
  }
  check(value)
  return JSON.stringify(value).replace(/[<\u2028\u2029]/g, (c) =>
    c === '<' ? '\\u003c' : c === '\u2028' ? '\\u2028' : '\\u2029',
  )
}

/** Snapshot entries from `skip` onwards: a stream flushes only new ones. */
export function snapshotEntries(
  map: Map<string, unknown>,
  what: string,
  skip = 0,
): [string, string, unknown][] {
  const entries: [string, string, unknown][] = []
  let index = 0
  for (const [composite, value] of map) {
    if (index++ < skip) continue
    const separator = composite.indexOf('\u0000')
    const id = composite.slice(0, separator)
    // Each value is checked on its own so the error names the id.
    stringifyPayload(value, () => `${what} ${id}`)
    entries.push([id, composite.slice(separator + 1), value])
  }
  return entries
}

/**
 * One request's render: the root tree, the request record, the promises the
 * request tracks (all of them, and the subset the streamed shell waits for),
 * and disposal. `renderToString` and `renderToStream` share it.
 */
export interface Session {
  rootId: string
  root: SFragment
  request: InternalRequest
  response: { status: number; headers: Headers }
  pending: Set<Promise<unknown>>
  shell: Set<Promise<unknown>>
  signal: AbortSignal | undefined
  /** Rejects with the abort reason; never resolves. */
  abortion: Promise<never>
  dispose(): void
}

export function beginRequest(
  app: () => Child,
  options: RenderOptions,
): Session {
  const rootId = options.rootId ?? '0'
  if (!/^[A-Za-z0-9_-]{1,32}$/.test(rootId))
    throw new Error(`Invalid rootId ${JSON.stringify(rootId)}`)
  const signal = options.signal
  if (signal?.aborted) throw signal.reason
  const pending = new Set<Promise<unknown>>()
  const shell = new Set<Promise<unknown>>()
  const cleanups: Array<() => void> = []
  const response = { status: 200, headers: new Headers() }
  const request: InternalRequest = {
    id: rootId,
    mode: 'server',
    resources: new Map(),
    queries: new Map(),
    response,
    track(promise, forShell) {
      pending.add(promise)
      if (forShell) shell.add(promise)
      const done = (): void => {
        pending.delete(promise)
        shell.delete(promise)
      }
      promise.then(done, done)
    },
    cleanup: (fn) => {
      cleanups.push(fn)
    },
  }
  if (signal) request.signal = signal
  if (options.onError) request.onError = options.onError
  const root = fragment()
  let disposeRoot = (): void => undefined
  let aborted: (() => void) | null = null
  let disposed = false
  const dispose = (): void => {
    if (disposed) return
    disposed = true
    if (aborted) signal?.removeEventListener('abort', aborted)
    setTearingDown(true)
    try {
      disposeRoot()
    } finally {
      setTearingDown(false)
    }
    for (const fn of cleanups) fn()
  }
  try {
    createRoot((done) => {
      disposeRoot = done
      internalRequest(request)
      const rootOwner = createInternalOwner('component', () => false)
      // Gate 1 holds user effects and onMount for the request's whole life;
      // render-tier bindings still run so staged content settles.
      setInternalOwnerGate(rootOwner, 1)
      let output!: Child
      try {
        runWithOwner(rootOwner, () => {
          output = app()
        })
        runWithOwner(rootOwner, () => mountValue(output, root, null, rootOwner))
      } catch (error) {
        options.onError?.(error, { phase: 'setup' })
        throw error
      }
    })
  } catch (error) {
    dispose()
    throw error
  }
  const abortion = new Promise<never>((_, reject) => {
    aborted = () => reject(signal?.reason)
    signal?.addEventListener('abort', aborted, { once: true })
  })
  // Races surface the rejection; this keeps it from being reported as
  // unhandled when a render finishes first.
  abortion.catch(() => undefined)
  return {
    rootId,
    root,
    request,
    response,
    pending,
    shell,
    signal,
    abortion,
    dispose,
  }
}

/**
 * Settles in rounds: a microtask lets Suspense reveal, then every promise in
 * `set` is awaited; a settled resource can track more. Rejects on abort.
 */
export async function settle(
  session: Session,
  set: Set<Promise<unknown>>,
): Promise<void> {
  for (;;) {
    await Promise.resolve()
    if (session.signal?.aborted) throw session.signal.reason
    if (set.size === 0) return
    await Promise.race([Promise.allSettled([...set]), session.abortion])
  }
}

export function payloadScript(rootId: string, payload: string): string {
  return payload
    ? `<script type="application/json" data-benos="${rootId}">${payload}</script>`
    : ''
}

export function checkPayloadSize(bytes: number, limit: number): void {
  if (bytes > limit)
    throw new RangeError(
      `Payload is ${bytes} bytes, over the ${limit} byte limit`,
    )
}

export async function renderToString(
  app: () => Child,
  options: RenderOptions = {},
): Promise<RenderResult> {
  const session = beginRequest(app, options)
  try {
    await settle(session, session.pending)
    if (development) validateStructure(session.root)
    const html = serializeChildren(session.root)
    const r = snapshotEntries(session.request.resources, 'resource')
    const q = snapshotEntries(session.request.queries, 'query')
    let payload = ''
    if (r.length || q.length) {
      payload = stringifyPayload({ v: 1, r, q }, () => 'payload')
      checkPayloadSize(
        new TextEncoder().encode(payload).byteLength,
        options.maxPayloadBytes ?? 1_048_576,
      )
    }
    const { rootId } = session
    return {
      html: `<!--benos:${rootId}:1-->${html}<!--/benos:${rootId}-->${payloadScript(rootId, payload)}`,
      payload,
      status: session.response.status,
      headers: session.response.headers,
    }
  } finally {
    session.dispose()
  }
}
