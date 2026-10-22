import {
  batch,
  createContext,
  getContext,
  onCleanup,
  signal,
  untrack,
} from '@benosjs/core'
import type { ReadonlySignal, Signal } from '@benosjs/core'
import { createRenderEffect } from '@benosjs/core/internal'
import { resource } from '@benosjs/async'
import type { Resource, ResourceState } from '@benosjs/async'
import type { JSX } from '@benosjs/dom'

export type KeyPart =
  | string
  | number
  | boolean
  | null
  | readonly KeyPart[]
  | { readonly [name: string]: KeyPart }

export interface FetchContext {
  signal: AbortSignal
  attempt: number
}

// eslint-disable-next-line @typescript-eslint/no-invalid-void-type -- detects argument-free queries
type KeyOption<A> = [A] extends [void]
  ? { key?: never }
  : [A] extends [KeyPart]
    ? { key?: (args: A) => KeyPart }
    : { key: (args: A) => KeyPart }

export type QueryOptions<A, T> = {
  fetch(args: A, context: FetchContext): T | Promise<T>
  staleTime?: number
  gcTime?: number
  retry?: false | number | ((failureCount: number, error: unknown) => boolean)
  retryDelay?: (failureCount: number, error: unknown) => number
  refetchOn?: { focus?: boolean; reconnect?: boolean }
} & KeyOption<A>

declare const targetBrand: unique symbol
declare const dataBrand: unique symbol
declare const writeBrand: unique symbol

export interface QueryTarget {
  readonly [targetBrand]: true
}

export interface QueryKey<T> extends QueryTarget {
  readonly [dataBrand]?: T
  /** Describes a write of a complete value. */
  set(value: T): QueryWrite
  /** Describes an update of existing data; it does nothing without data. */
  update(fn: (previous: T) => T): QueryWrite
}

export interface QueryWrite {
  readonly [writeBrand]: true
}

export interface QueryObserver<T> extends Resource<T> {
  fetching: ReadonlySignal<boolean>
  failureCount: ReadonlySignal<number>
  error: ReadonlySignal<unknown>
}

// eslint-disable-next-line @typescript-eslint/no-invalid-void-type -- detects argument-free queries
type Source<A> = [A] extends [void]
  ? [enabled?: () => boolean | null | undefined]
  : [source: () => A | false | null | undefined]
// eslint-disable-next-line @typescript-eslint/no-invalid-void-type -- detects argument-free queries
type Args<A> = [A] extends [void] ? [] : [args: A]

export interface QueryEntry<T> {
  readonly key: QueryKey<T>
  readonly value: ReadonlySignal<T>
  readonly fetching: ReadonlySignal<boolean>
  readonly error: ReadonlySignal<unknown>
  refresh(): Promise<T | undefined>
}

export type Query<A, T> = QueryTarget & {
  (...source: Source<A>): QueryObserver<T>
  key(...args: Args<A>): QueryKey<T>
  /** Resolves to the entry once it has data; for route loaders. */
  load(
    ...args: [...Args<A>, signal?: AbortSignal, cache?: QueryCache]
  ): Promise<QueryEntry<T>>
  where(match: (args: A) => boolean): QueryTarget
  prefetch(...args: [...Args<A>, cache?: QueryCache]): void
  peek(...args: [...Args<A>, cache?: QueryCache]): T | undefined
}

export interface QueryCache {
  invalidate(...targets: QueryTarget[]): Promise<void>
  write(...writes: QueryWrite[]): void
  dispose(): void
}

interface Definition {
  o: QueryOptions<unknown, unknown> & { key?: (args: unknown) => KeyPart }
  keys: Map<string, WeakRef<KeyRecord>>
}

class KeyRecord {
  constructor(
    readonly d: Definition,
    readonly h: string,
    readonly a: unknown,
  ) {}
  set(v: unknown): WriteRecord {
    return { k: this, v }
  }
  update(f: (previous: unknown) => unknown): WriteRecord {
    return { k: this, f }
  }
}

interface WriteRecord {
  k: KeyRecord
  v?: unknown
  f?: (previous: unknown) => unknown
}

interface Layer {
  e: Entry
  prev: unknown
  had: boolean
  g: number
}

interface TargetRecord {
  d: Definition
  h?: string
  p?: (args: unknown) => boolean
}

interface Request {
  c: AbortController
  j: number
  bg: boolean
  done: Promise<unknown>
  ok: (value: unknown) => void
  no: (error: unknown) => void
  t?: ReturnType<typeof setTimeout>
  next?: Request
}

interface Entry {
  k: KeyRecord
  cache: CacheRecord
  value: Signal<unknown>
  ready: Signal<boolean>
  fetching: Signal<boolean>
  failed: Signal<boolean>
  error: Signal<unknown>
  failures: Signal<number>
  at: number
  stale: boolean
  g: number
  req: Request | null
  n: number
  gc?: ReturnType<typeof setTimeout>
  handle?: QueryEntry<unknown>
}

interface CacheRecord extends QueryCache {
  entries: Map<Definition, Map<string, Entry>>
  dead: boolean
  listening: boolean
  off?: () => void
}

const development = process.env.NODE_ENV !== 'production'
const noop = (): void => undefined
const READY: ResourceState = { status: 'ready' }
const cacheContext = createContext<QueryCache | null>(null)
let defaultCache: CacheRecord | undefined
const caches = new WeakSet<object>()
const released = new FinalizationRegistry<{ d: Definition; h: string }>(
  ({ d, h }) => {
    if (!d.keys.get(h)?.deref()) d.keys.delete(h)
  },
)

function checkKey(value: unknown, seen: Set<unknown>): void {
  if (typeof value === 'number') {
    if (!Number.isFinite(value) || Object.is(value, -0))
      throw new TypeError(`Query key contains ${String(value)}`)
  } else if (value && typeof value === 'object') {
    if (seen.has(value)) throw new TypeError('Query key is cyclic')
    seen.add(value)
    if (Array.isArray(value)) {
      for (let i = 0; i < value.length; i++) {
        if (!(i in value)) throw new TypeError('Query key array is sparse')
        checkKey(value[i], seen)
      }
    } else if (Object.getPrototypeOf(value) === Object.prototype) {
      for (const item of Object.values(value)) checkKey(item, seen)
    } else throw new TypeError('Query key contains a non-plain object')
    seen.delete(value)
  } else if (
    value !== null &&
    typeof value !== 'string' &&
    typeof value !== 'boolean' &&
    value !== undefined
  )
    throw new TypeError(`Query key contains a ${typeof value}`)
}

function hashKey(value: unknown): string {
  if (development) checkKey(value, new Set())
  return String(
    JSON.stringify(value, (_, item: unknown) =>
      item && typeof item === 'object' && !Array.isArray(item)
        ? Object.fromEntries(
            Object.entries(item).sort(([a], [b]) => (a < b ? -1 : 1)),
          )
        : item,
    ),
  )
}

function keyFor(d: Definition, args: unknown): KeyRecord {
  const h = hashKey(d.o.key ? d.o.key(args) : args)
  let k = d.keys.get(h)?.deref()
  if (!k) {
    k = new KeyRecord(d, h, args)
    d.keys.set(h, new WeakRef(k))
    released.register(k, { d, h })
  }
  return k
}

function freeze(value: unknown): void {
  if (
    value &&
    typeof value === 'object' &&
    !Object.isFrozen(value) &&
    (Array.isArray(value) || Object.getPrototypeOf(value) === Object.prototype)
  ) {
    Object.freeze(value)
    for (const item of Object.values(value)) freeze(item)
  }
}

/** Classifies an error as transient: network, timeout, 408, 429, or 5xx. */
export function isTransientError(error: unknown): boolean {
  if (!error || (typeof error !== 'object' && typeof error !== 'function'))
    return false
  const { retryable, status, name } = error as {
    retryable?: unknown
    status?: unknown
    name?: unknown
  }
  if (typeof retryable === 'boolean') return retryable
  if (name === 'AbortError') return false
  if (typeof status === 'number')
    return status === 408 || status === 429 || (status >= 500 && status < 600)
  return error instanceof TypeError || name === 'TimeoutError'
}

function retryAfter(error: unknown): number | undefined {
  const raw = (error as { retryAfter?: unknown } | null)?.retryAfter
  if (typeof raw === 'number') return raw * 1000
  if (typeof raw !== 'string') return undefined
  const seconds = Number(raw)
  if (raw.trim() !== '' && Number.isFinite(seconds)) return seconds * 1000
  const date = Date.parse(raw)
  return Number.isNaN(date) ? undefined : Math.max(0, date - Date.now())
}

/** Returns the retry delay in ms, or undefined when the query should fail. */
function nextDelay(o: Definition['o'], count: number, error: unknown) {
  const { retry = 2, retryDelay } = o
  if (
    typeof retry === 'function'
      ? !retry(count, error)
      : retry === false || count > retry || !isTransientError(error)
  )
    return undefined
  if (retryDelay) return retryDelay(count, error)
  const after = retryAfter(error)
  if (after !== undefined) return after > 30_000 ? undefined : after
  const base = 300 * 3 ** (count - 1)
  return Math.min(base * (0.5 + Math.random() / 2), 30_000)
}

function isStale(e: Entry): boolean {
  return e.stale || Date.now() - e.at >= (e.k.d.o.staleTime ?? 5_000)
}

function start(e: Entry, bg: boolean): Request {
  let ok!: (value: unknown) => void
  let no!: (error: unknown) => void
  const done = new Promise<unknown>((yes, fail) => {
    ok = yes
    no = fail
  })
  done.catch(noop)
  const r: Request = { c: new AbortController(), j: 0, bg, done, ok, no }
  const g = e.g
  const current = () => e.req === r && !e.cache.dead
  // A write since this request started wins; joiners receive its value.
  const written = (): boolean => {
    if (e.g === g || !e.ready()) return false
    e.req = null
    e.fetching.set(false)
    ok(untrack(e.value))
    return true
  }
  e.req = r
  batch(() => {
    e.fetching.set(true)
    e.failures.set(0)
  })
  r.c.signal.addEventListener('abort', () => {
    clearTimeout(r.t)
    if (e.req === r) {
      e.req = null
      e.fetching.set(false)
    }
    no(r.c.signal.reason)
  })
  const attempt = (n: number): void => {
    let result: unknown
    try {
      result = untrack(() =>
        e.k.d.o.fetch(e.k.a, { signal: r.c.signal, attempt: n }),
      )
    } catch (error) {
      result = Promise.reject(error)
    }
    Promise.resolve(result).then(
      (value) => {
        if (!current() || written()) return
        if (development) freeze(value)
        e.req = null
        e.at = Date.now()
        e.stale = false
        batch(() => {
          e.value.set(value)
          e.ready.set(true)
          e.fetching.set(false)
          e.failed.set(false)
          e.error.set(undefined)
        })
        ok(value)
      },
      (error: unknown) => {
        if (!current() || r.c.signal.aborted || written()) return
        const delay = nextDelay(e.k.d.o, n + 1, error)
        if (delay === undefined) {
          e.req = null
          batch(() => {
            e.fetching.set(false)
            e.failed.set(true)
            e.error.set(error)
            e.failures.set(n + 1)
          })
          no(error)
        } else {
          e.failures.set(n + 1)
          r.t = setTimeout(() => attempt(n + 1), delay)
        }
      },
    )
  }
  attempt(0)
  return r
}

/** Starts a fresh request, moving joiners of an in-flight one onto it. */
function restart(e: Entry): Request {
  const old = e.req
  const r = start(e, old?.bg ?? true)
  if (old) {
    r.j = old.j
    old.next = r
    old.ok(r.done)
    old.c.abort()
  }
  return r
}

function join(e: Entry, signal: AbortSignal): Promise<unknown> {
  let r = e.req ?? start(e, false)
  r.j++
  signal.addEventListener('abort', () => {
    while (r.next) r = r.next
    // Abort after the current task, so an owner recreated in the same flush
    // (for example by a Suspense boundary) can rejoin the request.
    if (--r.j <= 0)
      queueMicrotask(() => {
        if (r.j <= 0 && !r.bg && e.req === r) r.c.abort()
      })
  })
  return r.done
}

function retain(e: Entry): void {
  e.n++
  clearTimeout(e.gc)
  const { refetchOn } = e.k.d.o
  if (refetchOn && (refetchOn.focus || refetchOn.reconnect)) listen(e.cache)
}

function release(e: Entry): void {
  if (--e.n > 0 || e.cache.dead) return
  const time = e.k.d.o.gcTime ?? 300_000
  if (time === Infinity) return
  e.gc = setTimeout(() => {
    if (e.n > 0) return
    e.cache.entries.get(e.k.d)?.delete(e.k.h)
    if (e.req && !e.req.j) e.req.c.abort()
  }, time)
}

function entryFor(cache: CacheRecord, k: KeyRecord): Entry {
  if (cache.dead) throw new Error('Query cache is disposed')
  let entries = cache.entries.get(k.d)
  if (!entries) cache.entries.set(k.d, (entries = new Map()))
  let e = entries.get(k.h)
  if (!e) {
    e = {
      k,
      cache,
      value: signal<unknown>(undefined),
      ready: signal(false),
      fetching: signal(false),
      failed: signal(false),
      error: signal<unknown>(undefined),
      failures: signal(0),
      at: 0,
      stale: false,
      g: 0,
      req: null,
      n: 1,
    }
    entries.set(k.h, e)
    release(e)
  }
  return e
}

/** Applies a write; an optimistic one returns its rollback layer. */
function apply(
  cache: CacheRecord,
  w: WriteRecord,
  optimistic: boolean,
): Layer | undefined {
  const e = entryFor(cache, w.k)
  const had = untrack(e.ready)
  if (w.f && !had) return undefined
  const prev = untrack(e.value)
  const next = w.f ? w.f(prev) : w.v
  if (development) freeze(next)
  e.g++
  batch(() => {
    e.value.set(next)
    e.ready.set(true)
  })
  if (!optimistic) {
    e.at = Date.now()
    e.stale = false
    return undefined
  }
  retain(e)
  return { e, prev, had, g: e.g }
}

function handleFor(e: Entry): QueryEntry<unknown> {
  return (e.handle ??= {
    key: e.k as unknown as QueryKey<unknown>,
    value: e.value.readonly(),
    fetching: e.fetching.readonly(),
    error: e.error.readonly(),
    refresh: () =>
      (e.req ?? start(e, true)).done.then(
        (value) => value,
        () => undefined,
      ),
  })
}

function wake(cache: CacheRecord, kind: 'focus' | 'reconnect'): void {
  for (const entries of cache.entries.values())
    for (const e of entries.values())
      if (e.n > 0 && !e.req && e.k.d.o.refetchOn?.[kind] && isStale(e))
        start(e, true)
}

function listen(cache: CacheRecord): void {
  if (cache.listening || typeof window === 'undefined') return
  cache.listening = true
  const focus = (): void => {
    if (document.visibilityState !== 'hidden') wake(cache, 'focus')
  }
  const online = (): void => wake(cache, 'reconnect')
  window.addEventListener('focus', focus)
  document.addEventListener('visibilitychange', focus)
  window.addEventListener('online', online)
  cache.off = () => {
    window.removeEventListener('focus', focus)
    document.removeEventListener('visibilitychange', focus)
    window.removeEventListener('online', online)
  }
}

function matches(target: TargetRecord, e: Entry): boolean {
  return target.h !== undefined
    ? target.h === e.k.h
    : !target.p || target.p(e.k.a)
}

/** Creates an isolated query cache, for tests or several apps on one page. */
export function createQueryCache(): QueryCache {
  const cache: CacheRecord = {
    entries: new Map(),
    dead: false,
    listening: false,
    invalidate(...targets) {
      const pending = new Map<Entry, Promise<unknown>>()
      for (const target of targets as unknown as TargetRecord[]) {
        for (const e of cache.entries.get(target.d)?.values() ?? []) {
          if (pending.has(e) || !matches(target, e)) continue
          e.stale = true
          if (e.n > 0 || e.req) pending.set(e, restart(e).done)
        }
      }
      return Promise.allSettled(pending.values()).then(noop)
    },
    write(...writes) {
      batch(() => {
        for (const w of writes as unknown as WriteRecord[])
          apply(cache, w, false)
      })
    },
    dispose() {
      if (cache.dead) return
      cache.dead = true
      cache.off?.()
      for (const entries of cache.entries.values())
        for (const e of entries.values()) {
          clearTimeout(e.gc)
          e.req?.c.abort()
        }
      cache.entries.clear()
    },
  }
  caches.add(cache)
  return cache
}

function resolveCache(explicit?: QueryCache): CacheRecord {
  let cache = explicit
  if (!cache) {
    try {
      cache = getContext(cacheContext) ?? undefined
    } catch {
      // Event handlers and module code have no current owner.
    }
  }
  return (cache ??
    (defaultCache ??= createQueryCache() as CacheRecord)) as CacheRecord
}

/** Returns the cache in scope: the nearest provider, else the page default. */
export function queryCache(): QueryCache {
  return resolveCache()
}

/** Provides a query cache to the components below it. */
export function QueryCacheProvider(props: {
  cache: QueryCache
  children?: unknown
}): JSX.Element {
  return cacheContext.Provider({
    value: props.cache,
    children: props.children,
  }) as JSX.Element
}

function observe(d: Definition, source: () => unknown): QueryObserver<unknown> {
  const cache = resolveCache()
  const current = signal<Entry | undefined>(undefined)
  let held: Entry | undefined
  const hold = (e: Entry | undefined): void => {
    if (e === held) return
    if (e) retain(e)
    if (held) release(held)
    held = e
  }
  const select = (args: unknown): void => {
    // A top-level `true` is the enable flag of an argument-free query.
    const e =
      args === false || args === null || args === undefined
        ? undefined
        : entryFor(cache, keyFor(d, args === true ? undefined : args))
    if (e === current()) return
    hold(e)
    current.set(e)
    if (e && e.ready() && !e.req && isStale(e)) start(e, true)
  }
  select(untrack(source))
  createRenderEffect(() => {
    const args = source()
    untrack(() => select(args))
  })
  onCleanup(() => hold(undefined))
  const inner = resource(current, (e, { signal }) => {
    if (held !== e) hold(e)
    return e.ready() ? e.value() : join(e, signal)
  })
  const ready = (): Entry | undefined => {
    const e = current()
    return e && e.ready() ? e : undefined
  }
  return {
    value: () => ready()?.value(),
    state: () => {
      const state = inner.state()
      return state.status !== 'disabled' && ready() ? READY : state
    },
    read() {
      const e = ready()
      if (e) return e.value()
      inner.read()
      return undefined
    },
    refresh() {
      const e = ready()
      if (!e || inner.state().status === 'disabled') return inner.refresh()
      hold(e)
      return (e.req ?? start(e, true)).done.then(
        (value) => value,
        () => undefined,
      )
    },
    cancel() {
      inner.cancel()
      hold(undefined)
    },
    fetching: () => current()?.fetching() ?? false,
    failureCount: () => current()?.failures() ?? 0,
    error: () => current()?.error(),
  }
}

export function query<A = void, T = unknown>(
  options: QueryOptions<A, T>,
): Query<A, T> {
  const d: Definition = {
    o: options as unknown as Definition['o'],
    keys: new Map(),
  }
  const lookup = (rest: unknown[]): [KeyRecord, CacheRecord] => {
    const last = rest[rest.length - 1]
    const cache = caches.has(last as object) ? rest.pop() : undefined
    return [keyFor(d, rest[0]), resolveCache(cache as QueryCache | undefined)]
  }
  const load = (...rest: unknown[]): Promise<QueryEntry<unknown>> => {
    const explicit = caches.has(rest[rest.length - 1] as object)
      ? (rest.pop() as QueryCache)
      : undefined
    const signal =
      rest[rest.length - 1] instanceof AbortSignal
        ? (rest.pop() as AbortSignal)
        : new AbortController().signal
    const e = entryFor(resolveCache(explicit), keyFor(d, rest[0]))
    retain(e)
    let held = true
    const drop = (): void => {
      if (held) release(e)
      held = false
    }
    try {
      // A route loader runs under its match owner: hold the entry while committed.
      onCleanup(drop)
    } catch {
      drop()
    }
    // Known-outdated data waits for a refetch; time-stale data revalidates behind it.
    if (e.ready() && !e.stale) {
      if (!e.req && isStale(e)) start(e, true)
      return Promise.resolve(handleFor(e))
    }
    return join(e, signal).then(() => handleFor(e))
  }
  const self = Object.assign(
    (source?: () => unknown) => observe(d, source ?? (() => true)),
    {
      d,
      key: (args?: unknown) => keyFor(d, args),
      where: (p: (args: unknown) => boolean) => ({ d, p }),
      load,
      prefetch(...rest: unknown[]) {
        const [k, cache] = lookup(rest)
        const e = entryFor(cache, k)
        if (!e.req && (!e.ready() || isStale(e))) start(e, true)
      },
      peek(...rest: unknown[]) {
        const [k, cache] = lookup(rest)
        const e = cache.entries.get(d)?.get(k.h)
        return e && e.ready() ? e.value() : undefined
      },
    },
  )
  return self as unknown as Query<A, T>
}

export interface MutationOptions<I, O> {
  run(input: I, context: { signal: AbortSignal }): O | Promise<O>
  /** Entries to refresh; `output` is undefined only for a cancelled run whose outcome is unknown. */
  affects?(input: I, output?: O): readonly QueryTarget[]
  writes?(input: I, output: O): readonly QueryWrite[]
  optimistic?(input: I): readonly QueryWrite[]
  awaitRefetch?: boolean
}

export type MutationResult<O> =
  { ok: true; value: O } | { ok: false; error: unknown; cancelled: boolean }

export type MutationState<O> =
  | { status: 'idle' }
  | { status: 'pending' }
  | { status: 'succeeded'; value: O }
  | { status: 'failed'; error: unknown }

export interface MutationHandle<I, O> {
  run(input: I): Promise<MutationResult<O>>
  state: ReadonlySignal<MutationState<O>>
  pending: ReadonlySignal<boolean>
  cancel(): void
  reset(): void
}

export interface Mutation<I, O> {
  (): MutationHandle<I, O>
  run(input: I, cache?: QueryCache): Promise<MutationResult<O>>
}

const IDLE = { status: 'idle' } as const
const PENDING = { status: 'pending' } as const

function execute<I, O>(
  o: MutationOptions<I, O>,
  input: I,
  cache: CacheRecord,
  c: AbortController,
): Promise<MutationResult<O>> {
  const layers: Layer[] = []
  const settle = (error: unknown): MutationResult<O> => {
    const cancelled = c.signal.aborted
    const unknown: QueryTarget[] = []
    batch(() => {
      for (const l of layers) {
        if (l.e.g === l.g) {
          l.e.g++
          l.e.value.set(l.prev)
          l.e.ready.set(l.had)
          if (cancelled) unknown.push(l.e.k as unknown as QueryTarget)
        } else unknown.push(l.e.k as unknown as QueryTarget)
        release(l.e)
      }
      if (cancelled) unknown.push(...(o.affects?.(input) ?? []))
      void cache.invalidate(...unknown)
    })
    return { ok: false, error, cancelled }
  }
  return new Promise<O>((resolve) => {
    batch(() => {
      for (const w of o.optimistic?.(input) ?? []) {
        const l = apply(cache, w as unknown as WriteRecord, true)
        if (l) layers.push(l)
      }
    })
    resolve(untrack(() => o.run(input, { signal: c.signal })))
  })
    .then((value) => {
      let refetch!: Promise<void>
      batch(() => {
        for (const l of layers.splice(0)) release(l.e)
        for (const w of o.writes?.(input, value) ?? [])
          apply(cache, w as unknown as WriteRecord, false)
        refetch = cache.invalidate(...(o.affects?.(input, value) ?? []))
      })
      const result: MutationResult<O> = { ok: true, value }
      return o.awaitRefetch === false ? result : refetch.then(() => result)
    }, settle)
    .catch((error: unknown) => ({ ok: false, error, cancelled: false }))
}

/** Defines a mutation whose cache effects are declared, not hand-written. */
export function mutation<I, O>(options: MutationOptions<I, O>): Mutation<I, O> {
  const handle = (): MutationHandle<I, O> => {
    const cache = resolveCache()
    const state = signal<MutationState<O>>(IDLE)
    const count = signal(0)
    const runs = new Set<AbortController>()
    let live = true
    let latest = 0
    try {
      onCleanup(() => {
        live = false
      })
    } catch {
      // A handle created outside an owner lives as long as it is referenced.
    }
    return {
      state: state.readonly(),
      pending: () => count() > 0,
      run(input) {
        const id = ++latest
        const c = new AbortController()
        runs.add(c)
        batch(() => {
          state.set(PENDING)
          count.update((n) => n + 1)
        })
        return execute(options, input, cache, c).then((result) => {
          runs.delete(c)
          if (live)
            batch(() => {
              count.update((n) => n - 1)
              if (id === latest)
                state.set(
                  result.ok
                    ? { status: 'succeeded', value: result.value }
                    : result.cancelled
                      ? IDLE
                      : { status: 'failed', error: result.error },
                )
            })
          return result
        })
      },
      cancel() {
        for (const c of runs) c.abort()
      },
      reset() {
        latest++
        state.set(IDLE)
      },
    }
  }
  return Object.assign(handle, {
    run: (input: I, cache?: QueryCache) =>
      execute(options, input, resolveCache(cache), new AbortController()),
  })
}
