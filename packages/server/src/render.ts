import { createRoot } from '@benosjs/core'
import {
  createInternalOwner,
  runWithOwner,
  internalRequest,
  setInternalOwnerGate,
  type InternalRequest,
} from '@benosjs/core/internal'
import type { Child } from '@benosjs/dom'
import { mountValue } from './host.js'
import { fragment } from './nodes.js'
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
function stringifyPayload(value: unknown, label: () => string): string {
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

function snapshotEntries(
  map: Map<string, unknown>,
  what: string,
): [string, string, unknown][] {
  const entries: [string, string, unknown][] = []
  for (const [composite, value] of map) {
    const separator = composite.indexOf('\u0000')
    const id = composite.slice(0, separator)
    // Each value is checked on its own so the error names the id.
    stringifyPayload(value, () => `${what} ${id}`)
    entries.push([id, composite.slice(separator + 1), value])
  }
  return entries
}

export async function renderToString(
  app: () => Child,
  options: RenderOptions = {},
): Promise<RenderResult> {
  const rootId = options.rootId ?? '0'
  if (!/^[A-Za-z0-9_-]{1,32}$/.test(rootId))
    throw new Error(`Invalid rootId ${JSON.stringify(rootId)}`)
  const signal = options.signal
  if (signal?.aborted) throw signal.reason
  const pending = new Set<Promise<unknown>>()
  const cleanups: Array<() => void> = []
  const response = { status: 200, headers: new Headers() }
  const request: InternalRequest = {
    id: rootId,
    mode: 'server',
    resources: new Map(),
    queries: new Map(),
    response,
    track(promise) {
      pending.add(promise)
      const done = (): void => {
        pending.delete(promise)
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
  let dispose = (): void => undefined
  let aborted: (() => void) | null = null
  try {
    createRoot((done) => {
      dispose = done
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
    const abortion = new Promise<never>((_, reject) => {
      aborted = () => reject(signal?.reason)
      signal?.addEventListener('abort', aborted, { once: true })
    })
    // The race below surfaces the rejection; this keeps it from being
    // reported as unhandled when the render finishes first.
    abortion.catch(() => undefined)
    // Settle in rounds: a microtask lets Suspense reveal, then every tracked
    // promise is awaited; a settled resource can track more.
    for (;;) {
      await Promise.resolve()
      if (signal?.aborted) throw signal.reason
      if (pending.size === 0) break
      await Promise.race([Promise.allSettled([...pending]), abortion])
    }
    if (development) validateStructure(root)
    const html = serializeChildren(root)
    const r = snapshotEntries(request.resources, 'resource')
    const q = snapshotEntries(request.queries, 'query')
    let payload = ''
    let script = ''
    if (r.length || q.length) {
      payload = stringifyPayload({ v: 1, r, q }, () => 'payload')
      const bytes = new TextEncoder().encode(payload).byteLength
      const limit = options.maxPayloadBytes ?? 1_048_576
      if (bytes > limit)
        throw new RangeError(
          `Payload is ${bytes} bytes, over the ${limit} byte limit`,
        )
      script = `<script type="application/json" data-benos="${rootId}">${payload}</script>`
    }
    return {
      html: `<!--benos:${rootId}:1-->${html}<!--/benos:${rootId}-->${script}`,
      payload,
      status: response.status,
      headers: response.headers,
    }
  } finally {
    if (aborted) signal?.removeEventListener('abort', aborted)
    dispose()
    for (const fn of cleanups) fn()
  }
}
