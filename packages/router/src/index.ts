import {
  batch,
  createRoot,
  createContext,
  effect,
  getContext,
  onCleanup,
  signal,
} from '@benosjs/core'
import type { ReadonlySignal, Signal } from '@benosjs/core'
import { createRenderEffect, runWithOwner } from '@benosjs/core/internal'
import { jsx } from '@benosjs/dom'
import {
  prepareInternalStage,
  registerInternalControl,
} from '@benosjs/dom/internal'
import type { Child, JSX } from '@benosjs/dom'
import { canonicalUrl, compilePath, formatPath, matchPath } from './path.js'
import type {
  JoinPath,
  PathParams,
  Pattern,
  ValidPath,
  ValidRelative,
} from './path.js'
export { browserHistory, memoryHistory } from './history.js'
export type { MemoryHistory, RouterHistory } from './history.js'
export type { PathParams } from './path.js'
import type { RouterHistory } from './history.js'
import { resource } from '@benosjs/async'

export interface SearchCodec<T> {
  parse(raw: URLSearchParams): T
  stringify(value: T): URLSearchParams
}

type Immutable<T> = T extends readonly unknown[]
  ? { readonly [K in keyof T]: Immutable<T[K]> }
  : T extends object
    ? { readonly [K in keyof T]: Immutable<T[K]> }
    : T
type MaybeSearch<S> = [S] extends [never]
  ? object
  : { search: ReadonlySignal<Immutable<S>> }
export type MatchHandle<P extends string, S, D = never> = {
  params: ReadonlySignal<Readonly<PathParams<P>>>
} & MaybeSearch<S> &
  ([D] extends [never] ? object : { data: ReadonlySignal<Immutable<D>> })

type SearchValue<S> = {
  search: [S] extends [never] ? undefined : Immutable<S>
}
export type RouteLoaderContext<P extends string, S = never> = {
  params: Readonly<PathParams<P>>
  signal: AbortSignal
  context: unknown
} & SearchValue<S>
type RuntimeLoader = (input: {
  params: Readonly<Record<string, string>>
  search: unknown
  signal: AbortSignal
  context: unknown
}) => unknown | Promise<unknown>
type RouteLoader<P extends string, S, D> = (
  input: RouteLoaderContext<P, S>,
) => D | Promise<D>

interface RouteBase {
  readonly path: string
  readonly codec?: SearchCodec<unknown>
  match(): unknown
}
export interface RouteRef<
  P extends string,
  S = never,
  D = never,
> extends RouteBase {
  readonly path: P
  match(): MatchHandle<P, S, D>
}

type RuntimeMatchHandle = {
  params: ReadonlySignal<Readonly<Record<string, string>>>
  search: ReadonlySignal<unknown>
  data?: ReadonlySignal<unknown>
}
type MatchContextValue = {
  ref: RouteBase | null
  handle: RuntimeMatchHandle
} | null
const matchContext = createContext<MatchContextValue>(null)
const routeLoaders = new WeakMap<RouteBase, RuntimeLoader>()
type ChildPath<Parent extends RouteBase, C extends string> = C &
  ValidRelative<C> &
  (ValidPath<JoinPath<Parent['path'], C>> extends never ? never : C)

export function route<const P extends string>(
  path: P & ValidPath<P>,
): RouteRef<P>
export function route<const P extends string, S, D>(
  path: P & ValidPath<P>,
  options: { search: SearchCodec<S>; loader: RouteLoader<P, S, D> },
): RouteRef<P, S, Awaited<D>>
export function route<const P extends string, S>(
  path: P & ValidPath<P>,
  options: { search: SearchCodec<S> },
): RouteRef<P, S>
export function route<const P extends string, D>(
  path: P & ValidPath<P>,
  options: { loader: RouteLoader<P, never, D> },
): RouteRef<P, never, Awaited<D>>
export function route<
  const Parent extends RouteBase,
  const C extends string,
  S,
  D,
>(
  path: ChildPath<Parent, C>,
  options: {
    parent: Parent
    search: SearchCodec<S>
    loader: RouteLoader<JoinPath<Parent['path'], C>, S, D>
  },
): RouteRef<JoinPath<Parent['path'], C>, S, Awaited<D>>
export function route<
  const Parent extends RouteBase,
  const C extends string,
  S,
>(
  path: ChildPath<Parent, C>,
  options: { parent: Parent; search: SearchCodec<S> },
): RouteRef<JoinPath<Parent['path'], C>, S>
export function route<
  const Parent extends RouteBase,
  const C extends string,
  D,
>(
  path: ChildPath<Parent, C>,
  options: {
    parent: Parent
    loader: RouteLoader<JoinPath<Parent['path'], C>, never, D>
  },
): RouteRef<JoinPath<Parent['path'], C>, never, Awaited<D>>
export function route<const Parent extends RouteBase, const C extends string>(
  path: ChildPath<Parent, C>,
  options: { parent: Parent },
): RouteRef<JoinPath<Parent['path'], C>>
export function route(
  path: string,
  options: {
    parent?: RouteBase
    loader?: unknown
    search?: {
      parse(raw: URLSearchParams): unknown
      stringify(value: never): URLSearchParams
    }
  } = {},
): RouteRef<string, unknown, unknown> {
  const fullPath = options.parent
    ? options.parent.path === '/'
      ? `/${path}`
      : `${options.parent.path}/${path}`
    : path
  compilePath(fullPath)
  const ref = Object.freeze({
    path: fullPath,
    ...(options.search
      ? { codec: options.search as SearchCodec<unknown> }
      : {}),
    match() {
      let current: MatchContextValue
      try {
        current = getContext(matchContext)
      } catch {
        throw new Error(
          `route.match() requires its matching route scope: ${fullPath}`,
        )
      }
      if (!current || current.ref !== this)
        throw new Error(
          `route.match() requires its matching route scope: ${fullPath}`,
        )
      return current.handle
    },
  }) as RouteRef<string, unknown, unknown>
  if (options.loader)
    routeLoaders.set(ref, options.loader as unknown as RuntimeLoader)
  return ref
}

type PathOf<R extends RouteBase> = R['path']
type SearchOf<R extends RouteBase> =
  R extends RouteRef<string, infer S> ? S : never
type ParamsArgument<R extends RouteBase> = keyof PathParams<
  PathOf<R>
> extends never
  ? { params?: never }
  : { params: PathParams<PathOf<R>> }
type SearchArgument<R extends RouteBase> = [SearchOf<R>] extends [never]
  ? { search?: never }
  : { search: SearchOf<R> }
export type NavigationTarget<R extends RouteBase> = {
  to: R
  replace?: boolean
  hash?: string
} & ParamsArgument<R> &
  SearchArgument<R>

export interface Redirect<R extends RouteBase = RouteBase> {
  readonly target: NavigationTarget<R>
}
export function redirect<R extends RouteBase>(
  target: NavigationTarget<R>,
): Redirect<R> {
  return { target }
}

export interface RouteNode<R extends RouteBase | null = RouteBase | null> {
  readonly ref: R
  readonly component?: () => Child
  readonly lazy?: () => Promise<{ default: () => Child }>
  readonly children: readonly RouteNode[]
  readonly index?: boolean
  readonly redirect?: Redirect
  readonly pending?: () => Child
  readonly error?: (props: RouteErrorProps) => Child
}

export interface RouteErrorProps {
  error: unknown
  retry(): void
}

export function mountRoute<R extends RouteBase | null>(
  ref: R,
  options: Omit<RouteNode<R>, 'ref' | 'children'> & {
    children?: readonly RouteNode[]
  },
): RouteNode<R> {
  if (
    !options.component &&
    !options.lazy &&
    !options.redirect &&
    !options.children?.length
  )
    throw new Error(
      'Mounted route needs a component, lazy view, redirect, or children',
    )
  return { ...options, ref, children: options.children ?? [] }
}

interface Registered {
  node: RouteNode
  pattern: Pattern
  branch: readonly Registered[]
  order: number
  component?: () => Child
  loading?: Promise<void> | undefined
  loader?: RuntimeLoader
}
export interface CommittedMatch {
  readonly route: RouteBase | null
  readonly params: Readonly<Record<string, string>>
  readonly search: unknown
  readonly data?: unknown
}
interface ActiveMatch {
  route: RouteBase | null
  registered: Registered
  handle: RuntimeMatchHandle
  setParams: Signal<Readonly<Record<string, string>>>
  setSearch: Signal<unknown>
  setData?: Signal<unknown>
  disposeLoader?: () => void
}
export type NavigationState =
  | { status: 'idle' }
  | {
      status: 'loading'
      destination: string
      reason: 'link' | 'programmatic' | 'pop'
    }
  | { status: 'blocked'; destination: string }
export type NavigationResult =
  | { status: 'committed'; location: string }
  | { status: 'redirected'; location: string }
  | { status: 'superseded' }

interface PendingRouteView {
  destination: string
  branch: readonly Registered[]
}
interface RouteFailureState {
  destination: string
  branch: readonly Registered[]
  boundaryIndex: number
  error: unknown
}
interface LoadedRoute {
  data: unknown
  dispose?: () => void
}
class RouteLoadFailure extends Error {
  constructor(
    readonly record: Registered,
    readonly cause: unknown,
  ) {
    super('Route load failed')
  }
}

export interface Router {
  readonly location: ReadonlySignal<string>
  readonly navigation: ReadonlySignal<NavigationState>
  readonly matches: ReadonlySignal<readonly CommittedMatch[]>
  href<R extends RouteBase>(target: NavigationTarget<R>): string
  navigate<R extends RouteBase>(
    target: NavigationTarget<R>,
  ): Promise<NavigationResult>
  back(): void
  forward(): void
  mount(): () => void
  dispose(): void
}
interface RouterInternal extends Router {
  readonly active: ReadonlySignal<readonly ActiveMatch[]>
  readonly ready: ReadonlySignal<boolean>
  readonly pendingRoute: ReadonlySignal<PendingRouteView | null>
  readonly failure: ReadonlySignal<RouteFailureState | null>
  readonly announcement: ReadonlySignal<string>
  readonly notFound: (() => Child) | undefined
  retry(url: string): Promise<NavigationResult>
  navigateLink<R extends RouteBase>(
    target: NavigationTarget<R>,
  ): Promise<NavigationResult>
}

function rank(pattern: Pattern): readonly number[] {
  return pattern.segments.map((segment) =>
    segment.startsWith('*') ? 1 : segment.startsWith(':') ? 2 : 3,
  )
}
function compareRank(a: Registered, b: Registered): number {
  const left = rank(a.pattern)
  const right = rank(b.pattern)
  for (let i = 0; i < Math.max(left.length, right.length); i++) {
    if (left[i] !== right[i]) return (right[i] ?? 0) - (left[i] ?? 0)
  }
  if (a.node.index !== b.node.index) return a.node.index ? -1 : 1
  if (a.branch.length !== b.branch.length)
    return b.branch.length - a.branch.length
  return a.order - b.order
}
function shape(pattern: Pattern): string {
  return pattern.segments
    .map((part) =>
      part.startsWith(':') ? ':' : part.startsWith('*') ? '*' : part,
    )
    .join('/')
}
function freezeSnapshot<T>(value: T, seen = new WeakSet<object>()): T {
  if (value && typeof value === 'object' && !seen.has(value)) {
    if (
      Array.isArray(value) ||
      Object.getPrototypeOf(value) === Object.prototype
    ) {
      seen.add(value)
      for (const item of Object.values(value)) freezeSnapshot(item, seen)
      Object.freeze(value)
    }
  }
  return value
}

export function createRouter(options: {
  routes: readonly RouteNode[]
  history: RouterHistory
  context?: unknown
  notFound?: () => Child
  caseSensitive?: boolean
}): Router {
  const registered = new Set<RouteBase>()
  const candidates: Registered[] = []
  const shapes = new Map<string, Registered>()
  const visit = (
    nodes: readonly RouteNode[],
    parent: Registered | null,
  ): void => {
    for (const node of nodes) {
      const path = node.ref?.path ?? parent?.pattern.path ?? '/'
      const pattern = compilePath(path)
      if (
        parent &&
        parent.pattern.path !== '/' &&
        path !== parent.pattern.path &&
        !path.startsWith(parent.pattern.path + '/')
      )
        throw new Error(`Child route ${path} is outside ${parent.pattern.path}`)
      if (node.index && path !== parent?.pattern.path)
        throw new Error('Index route must use its parent path')
      if (node.ref) {
        if (registered.has(node.ref))
          throw new Error(`Route reference registered twice: ${path}`)
        registered.add(node.ref)
      }
      const loader = node.ref ? routeLoaders.get(node.ref) : undefined
      const current: Registered = {
        node,
        pattern,
        branch: [],
        order: candidates.length,
        ...(loader ? { loader } : {}),
      }
      current.branch = [...(parent?.branch ?? []), current]
      if (node.ref && !node.index) {
        const key = shape(pattern)
        const earlier = shapes.get(key)
        if (earlier && earlier !== parent)
          throw new Error(
            `Ambiguous route paths: ${earlier.pattern.path} and ${path}`,
          )
        shapes.set(key, current)
      }
      candidates.push(current)
      visit(node.children, current)
    }
  }
  visit(options.routes, null)
  candidates.sort(compareRank)
  const history = options.history
  const loaderContext = freezeSnapshot(options.context)
  const location = signal(history.location())
  const navigationState = signal<NavigationState>({ status: 'idle' })
  const active = signal<readonly ActiveMatch[]>([])
  const matches = signal<readonly CommittedMatch[]>([])
  const ready = signal(false)
  const pendingRoute = signal<PendingRouteView | null>(null)
  const failure = signal<RouteFailureState | null>(null)
  const announcement = signal('')
  let generation = 0
  let mounted = 0
  let unlisten: (() => void) | null = null
  let disposeCandidate: (() => void) | null = null
  let temporaryFocusTarget: {
    element: HTMLElement
    tabindex: string | null
  } | null = null
  const restoreTemporaryTabindex = (): void => {
    if (!temporaryFocusTarget) return
    const { element, tabindex } = temporaryFocusTarget
    if (tabindex === null) element.removeAttribute('tabindex')
    else element.setAttribute('tabindex', tabindex)
    temporaryFocusTarget = null
  }

  const href = <R extends RouteBase>(target: NavigationTarget<R>): string => {
    if (!registered.has(target.to))
      throw new Error(`Unregistered route reference: ${target.to.path}`)
    const path = formatPath(
      compilePath(target.to.path),
      target.params as Record<string, string> | undefined,
    )
    const search = target.to.codec
      ? target.to.codec.stringify(target.search).toString()
      : ''
    const sorted = new URLSearchParams(search)
    sorted.sort()
    const hash = target.hash
      ? target.hash.startsWith('#')
        ? target.hash
        : `#${target.hash}`
      : ''
    return path + (sorted.size ? `?${sorted}` : '') + hash
  }

  const select = (
    url: string,
  ): { branch: readonly Registered[]; params: Record<string, string> } => {
    const pathname = new URL(url, 'http://benos.local').pathname
    for (const candidate of candidates) {
      const params = matchPath(
        candidate.pattern,
        pathname,
        options.caseSensitive ?? true,
      )
      if (params) return { branch: candidate.branch, params }
    }
    return { branch: [], params: {} }
  }
  const ensureComponent = (record: Registered): Promise<void> => {
    if (record.component || !record.node.lazy) return Promise.resolve()
    if (!record.loading)
      record.loading = record.node.lazy().then(
        (module) => {
          record.component = module.default
        },
        (error: unknown) => {
          record.loading = undefined
          throw error
        },
      )
    return record.loading
  }
  const paramsFor = (
    record: Registered,
    params: Record<string, string>,
  ): Readonly<Record<string, string>> => {
    const ownParams: Record<string, string> = {}
    for (const segment of record.pattern.segments) {
      if (segment.startsWith(':') || segment.startsWith('*')) {
        const name = segment.slice(1)
        if (params[name] !== undefined) ownParams[name] = params[name]
      }
    }
    return freezeSnapshot(ownParams)
  }
  const loadRecord = (
    record: Registered,
    params: Record<string, string>,
    search: unknown,
  ): { promise: Promise<LoadedRoute>; dispose: () => void } | null => {
    const loader = record.loader
    if (!loader) return null
    const input = { params: paramsFor(record, params), search }
    let dispose = (): void => undefined
    let resolve!: (value: LoadedRoute) => void
    let reject!: (error: unknown) => void
    let settled = false
    const promise = new Promise<LoadedRoute>((done, fail) => {
      resolve = done
      reject = fail
    })
    createRoot((disposeRoot) => {
      dispose = disposeRoot
      onCleanup(() => {
        if (settled) return
        settled = true
        reject(new Error('Route loader was cancelled'))
      })
      const request = resource(
        () => input,
        (key, resourceContext) =>
          loader({
            ...key,
            signal: resourceContext.signal,
            context: loaderContext,
          }),
      )
      effect(() => {
        const state = request.state()
        if (state.status === 'ready') {
          settled = true
          resolve({ data: request.value(), dispose })
        } else if (state.status === 'failed') {
          settled = true
          reject(state.error)
        }
      })
    })
    return {
      promise: promise.catch((error: unknown) => {
        throw new RouteLoadFailure(record, error)
      }),
      dispose,
    }
  }
  const commit = (
    url: string,
    branch: readonly Registered[],
    params: Record<string, string>,
    parsed: readonly unknown[],
    loaded: readonly LoadedRoute[],
    routeFailure: RouteFailureState | null = null,
  ): void => {
    const previous = active()
    const updates: Array<() => void> = []
    const disposePrevious = new Set<() => void>()
    const next = branch.map((record, index): ActiveMatch => {
      const ownParams: Record<string, string> = {}
      for (const segment of record.pattern.segments) {
        if (segment.startsWith(':') || segment.startsWith('*')) {
          const name = segment.slice(1)
          if (params[name] !== undefined) ownParams[name] = params[name]
        }
      }
      freezeSnapshot(ownParams)
      const prior = previous[index]
      if (prior?.registered === record) {
        updates.push(() => {
          prior.setParams.set(ownParams)
          prior.setSearch.set(parsed[index])
          prior.setData?.set(loaded[index]?.data)
          if (prior.disposeLoader) disposePrevious.add(prior.disposeLoader)
          if (loaded[index]?.dispose)
            prior.disposeLoader = loaded[index].dispose
          else delete prior.disposeLoader
        })
        return prior
      }
      const setParams = signal<Readonly<Record<string, string>>>(ownParams)
      const setSearch = signal<unknown>(parsed[index])
      const setData = record.loader
        ? signal<unknown>(loaded[index]?.data)
        : undefined
      const handle = {
        params: setParams as ReadonlySignal<Readonly<Record<string, string>>>,
        search: setSearch as ReadonlySignal<unknown>,
        ...(setData ? { data: setData.readonly() } : {}),
      }
      if (prior?.disposeLoader) disposePrevious.add(prior.disposeLoader)
      return {
        route: record.node.ref,
        registered: record,
        handle,
        setParams,
        setSearch,
        ...(setData ? { setData } : {}),
        ...(loaded[index]?.dispose
          ? { disposeLoader: loaded[index].dispose }
          : {}),
      }
    })
    for (const prior of previous.slice(branch.length))
      if (prior.disposeLoader) disposePrevious.add(prior.disposeLoader)
    batch(() => {
      for (const update of updates) update()
      location.set(url)
      active.set(next)
      matches.set(
        next.map(({ route, setParams, setSearch, setData }) => ({
          route,
          params: setParams(),
          search: setSearch(),
          ...(setData ? { data: setData() } : {}),
        })),
      )
      pendingRoute.set(null)
      failure.set(routeFailure)
      announcement.set(routeFailure ? 'Page failed to load' : 'Page loaded')
      navigationState.set({ status: 'idle' })
      ready.set(true)
    })
    for (const dispose of disposePrevious) dispose()
  }
  const afterCommit = (
    url: string,
    mode: 'push' | 'replace' | 'pop' | 'initial',
    id: number,
    previousUrl: string,
  ): void => {
    if (typeof document === 'undefined' || mode === 'initial') return
    queueMicrotask(() => {
      if (id !== generation) return
      const from = new URL(previousUrl, 'http://benos.local')
      const to = new URL(url, 'http://benos.local')
      const hash = new URL(url, 'http://benos.local').hash
      let scrollAfterFocus: (() => void) | undefined
      if (hash) {
        let target: HTMLElement | null = null
        try {
          target = document.getElementById(decodeURIComponent(hash.slice(1)))
        } catch {
          target = null
        }
        if (target?.scrollIntoView)
          scrollAfterFocus = () => target?.scrollIntoView()
        else
          document.defaultView?.requestAnimationFrame(() => {
            try {
              document
                .getElementById(decodeURIComponent(hash.slice(1)))
                ?.scrollIntoView?.()
            } catch {
              return
            }
          })
      } else if (mode === 'pop' && history.scrollPosition) {
        const position = history.scrollPosition?.()
        if (position)
          scrollAfterFocus = () =>
            document.defaultView?.scrollTo(position.x, position.y)
      } else if (mode === 'push' && history.saveScroll) {
        scrollAfterFocus = () => document.defaultView?.scrollTo(0, 0)
      }
      const restoreScroll = (): void => {
        if (id !== generation) return
        scrollAfterFocus?.()
        history.completeScrollRestoration?.()
      }
      const target =
        document.querySelector<HTMLElement>('[data-route-focus]') ??
        document.querySelector<HTMLElement>('main, [role="main"], h1')
      if (!failure()) {
        const title =
          target?.getAttribute('aria-label') ||
          target?.textContent?.trim() ||
          document.title
        announcement.set(title || 'Page loaded')
      }
      if (
        (from.pathname === to.pathname && from.search === to.search) ||
        !target
      ) {
        if (scrollAfterFocus || mode === 'pop' || mode === 'replace')
          document.defaultView?.requestAnimationFrame(restoreScroll)
        return
      }
      restoreTemporaryTabindex()
      const tabindex = target.getAttribute('tabindex')
      if (tabindex === null) {
        target.setAttribute('tabindex', '-1')
        temporaryFocusTarget = { element: target, tabindex }
      }
      target.focus({ preventScroll: true })
      if (scrollAfterFocus || mode === 'pop' || mode === 'replace')
        document.defaultView?.requestAnimationFrame(restoreScroll)
    })
  }

  const navigateUrl = async (
    input: string,
    mode: 'push' | 'replace' | 'pop' | 'initial',
    reason: 'link' | 'programmatic' | 'pop',
  ): Promise<NavigationResult> => {
    const id = ++generation
    disposeCandidate?.()
    disposeCandidate = null
    const candidateRoots = new Set<() => void>()
    const discardCandidate = (): void => {
      for (const dispose of candidateRoots) dispose()
      candidateRoots.clear()
    }
    disposeCandidate = discardCandidate
    let url = canonicalUrl(input)
    let redirected = false
    const seen = new Set<string>()
    navigationState.set({ status: 'loading', destination: url, reason })
    try {
      for (let hops = 0; hops < 16; hops++) {
        if (seen.has(url)) throw new Error(`Redirect cycle at ${url}`)
        seen.add(url)
        const selected = select(url)
        const redirectNode = [...selected.branch]
          .reverse()
          .find((entry) => entry.node.redirect)
        if (!redirectNode) {
          const rawSearch = new URL(url, 'http://benos.local').searchParams
          const parsed = selected.branch.map((record) =>
            record.node.ref?.codec
              ? freezeSnapshot(record.node.ref.codec.parse(rawSearch))
              : undefined,
          )
          pendingRoute.set({ destination: url, branch: selected.branch })
          const loaded: LoadedRoute[] = []
          const jobs: Array<{
            index: number
            record: Registered
            promise: Promise<void>
          }> = []
          selected.branch.forEach((record, index) => {
            const load = loadRecord(record, selected.params, parsed[index])
            if (load) candidateRoots.add(load.dispose)
            if (!load && (record.component || !record.node.lazy)) {
              loaded[index] = { data: undefined }
              return
            }
            const promise = Promise.all([
              ensureComponent(record).catch((error: unknown) => {
                throw new RouteLoadFailure(record, error)
              }),
              load?.promise ?? Promise.resolve({ data: undefined }),
            ]).then(([, result]) => {
              loaded[index] = result
            })
            jobs.push({ index, record, promise })
          })
          try {
            await Promise.all(jobs.map((job) => job.promise))
          } catch (caught) {
            if (id !== generation) {
              discardCandidate()
              return { status: 'superseded' }
            }
            const fallbackRecord = selected.branch.at(-1)
            if (!fallbackRecord) throw caught
            const failed =
              caught instanceof RouteLoadFailure
                ? caught
                : new RouteLoadFailure(fallbackRecord, caught)
            const failedIndex = Math.max(
              0,
              selected.branch.indexOf(failed.record),
            )
            await Promise.allSettled(
              jobs
                .filter((job) => job.index < failedIndex)
                .map((job) => job.promise),
            )
            if (id !== generation) {
              discardCandidate()
              return { status: 'superseded' }
            }
            let boundaryIndex = failedIndex
            for (let index = failedIndex; index >= 0; index--) {
              if (selected.branch[index]?.node.error) {
                boundaryIndex = index
                break
              }
            }
            const visibleBranch = selected.branch.slice(0, boundaryIndex + 1)
            const visibleLoaded = visibleBranch.map(
              (_record, index) => loaded[index] ?? { data: undefined },
            )
            const kept = new Set(
              visibleLoaded.flatMap((entry) =>
                entry.dispose ? [entry.dispose] : [],
              ),
            )
            for (const dispose of kept) candidateRoots.delete(dispose)
            discardCandidate()
            disposeCandidate = null
            const previousUrl = location()
            if (mode === 'push' && !redirected) {
              history.saveScroll?.()
              history.push(url)
            } else if (
              mode === 'replace' ||
              redirected ||
              ((mode === 'initial' || mode === 'pop') &&
                history.location() !== url)
            )
              history.replace(url)
            commit(url, visibleBranch, selected.params, parsed, visibleLoaded, {
              destination: url,
              branch: visibleBranch,
              boundaryIndex,
              error: failed.cause,
            })
            afterCommit(url, mode, id, previousUrl)
            return { status: 'committed', location: url }
          }
          if (id !== generation) {
            discardCandidate()
            return { status: 'superseded' }
          }
          const previousUrl = location()
          if (mode === 'push' && !redirected) {
            history.saveScroll?.()
            history.push(url)
          } else if (
            mode === 'replace' ||
            redirected ||
            ((mode === 'initial' || mode === 'pop') &&
              history.location() !== url)
          )
            history.replace(url)
          disposeCandidate = null
          candidateRoots.clear()
          commit(url, selected.branch, selected.params, parsed, loaded)
          afterCommit(url, mode, id, previousUrl)
          return {
            status: redirected ? 'redirected' : 'committed',
            location: url,
          }
        }
        const destination = redirectNode.node.redirect
        if (!destination) throw new Error('Redirect target is missing')
        url = href(destination.target)
        redirected = true
      }
      throw new Error('Too many route redirects')
    } catch (error) {
      if (id === generation) {
        discardCandidate()
        disposeCandidate = null
        pendingRoute.set(null)
        navigationState.set({ status: 'idle' })
      }
      throw error
    }
  }
  const releaseRuntime = (): void => {
    generation++
    disposeCandidate?.()
    disposeCandidate = null
    unlisten?.()
    unlisten = null
    for (const match of active()) match.disposeLoader?.()
    active.set([])
    matches.set([])
    pendingRoute.set(null)
    failure.set(null)
    navigationState.set({ status: 'idle' })
    ready.set(false)
    restoreTemporaryTabindex()
  }
  const router: RouterInternal = {
    location,
    navigation: navigationState,
    matches,
    active,
    ready,
    pendingRoute,
    failure,
    announcement,
    notFound: options.notFound,
    retry: (url) => navigateUrl(url, 'replace', 'programmatic'),
    href,
    navigate: (target) =>
      navigateUrl(
        href(target),
        target.replace ? 'replace' : 'push',
        'programmatic',
      ),
    navigateLink: (target) =>
      navigateUrl(href(target), target.replace ? 'replace' : 'push', 'link'),
    back: () => history.back(),
    forward: () => history.forward(),
    mount() {
      mounted++
      if (mounted === 1) {
        unlisten = history.listen((url) => {
          void navigateUrl(url, 'pop', 'pop')
        })
        void navigateUrl(history.location(), 'initial', 'programmatic')
      }
      let released = false
      return () => {
        if (released) return
        released = true
        if (--mounted === 0) {
          releaseRuntime()
        }
      }
    },
    dispose() {
      mounted = 0
      releaseRuntime()
    },
  }
  return router
}

type RouterContextValue = {
  router: RouterInternal
  depth: number
} | null
const routerContext = createContext<RouterContextValue>(null)
function currentRouter(): RouterInternal {
  let context: RouterContextValue
  try {
    context = getContext(routerContext)
  } catch {
    throw new Error('Router API requires a RouterOutlet owner')
  }
  if (!context) throw new Error('Router API requires a RouterOutlet owner')
  return context.router
}
export function navigation(): ReadonlySignal<NavigationState> {
  return currentRouter().navigation
}
export function getRouter(): Router {
  return currentRouter()
}
export function navigate<R extends RouteBase>(
  target: NavigationTarget<R>,
): Promise<NavigationResult> {
  return currentRouter().navigate(target)
}

export function RouterOutlet(props: { router: Router }): JSX.Element {
  const router = props.router as RouterInternal
  const release = router.mount()
  onCleanup(release)
  const status = jsx('span', {
    'data-router-status': '',
    role: 'status',
    'aria-live': 'polite',
    'aria-atomic': 'true',
    style: {
      position: 'absolute',
      width: '1px',
      height: '1px',
      padding: '0',
      margin: '-1px',
      overflow: 'hidden',
      clip: 'rect(0, 0, 0, 0)',
      whiteSpace: 'nowrap',
      border: '0',
    },
    get children() {
      return router.navigation().status === 'loading'
        ? 'Loading page'
        : router.announcement()
    },
  })
  return routerContext.Provider({
    value: { router, depth: 0 },
    children: [status, jsx(Outlet, {})],
  }) as JSX.Element
}

export function Outlet(): JSX.Element {
  throw new Error('Outlet requires the Benos DOM renderer')
}
registerInternalControl(Outlet, (_props, parent, before, owner) => {
  const context = getContext(routerContext)
  if (!context) throw new Error('Outlet requires a RouterOutlet owner')
  const document = parent instanceof Document ? parent : parent.ownerDocument
  if (!document) throw new Error('Outlet requires a DOM document')
  const marker = document.createComment('')
  parent.insertBefore(marker, before)
  let current: Registered | null = null
  let currentMode = 'empty'
  let stage: ReturnType<typeof prepareInternalStage> | null = null
  createRenderEffect(() => {
    const router = context.router
    const match = router.active()[context.depth]
    const routeFailure = router.failure()
    const pending = router.pendingRoute()
    const ready = router.ready()
    let record = match?.registered ?? null
    let mode = 'normal'
    let render: (() => Child) | undefined
    if (routeFailure && context.depth > routeFailure.boundaryIndex) {
      record = null
      mode = 'suppressed'
    } else if (routeFailure && context.depth === routeFailure.boundaryIndex) {
      record = routeFailure.branch[context.depth] ?? null
      mode = 'error'
      const errorView = record?.node.error
      if (errorView) {
        const error = routeFailure.error
        const destination = routeFailure.destination
        render = () =>
          jsx(
            () =>
              errorView({
                error,
                retry: () => void router.retry(destination),
              }),
            {},
          )
      } else
        render = () => {
          throw routeFailure.error
        }
    } else if (match) {
      const component = record?.component ?? record?.node.component
      if (component)
        render = () =>
          routerContext.Provider({
            value: { router, depth: context.depth + 1 },
            children: () => [
              matchContext.Provider({
                value: {
                  ref: record?.node.ref ?? null,
                  handle: match.handle,
                },
                children: jsx(component, {}),
              }),
            ],
          }) as Child
    } else if (!ready && context.depth === 0 && pending) {
      const pendingRecord = [...pending.branch]
        .reverse()
        .find((entry) => entry.node.pending)
      record = pendingRecord ?? null
      mode = 'pending'
      const pendingView = pendingRecord?.node.pending
      if (pendingView) render = () => jsx(pendingView, {})
    } else if (context.depth === 0 && ready && router.notFound) {
      mode = 'not-found'
      render = router.notFound
    } else {
      record = null
      mode = 'empty'
    }
    if (current === record && currentMode === mode) return
    stage?.dispose()
    stage = null
    current = record
    currentMode = mode
    const renderStage = render
    if (renderStage && mode !== 'suppressed')
      stage = runWithOwner(owner, () =>
        prepareInternalStage(renderStage, parent),
      )
    stage?.commit(marker)
  })
  onCleanup(() => {
    stage?.dispose()
    marker.remove()
  })
  return [marker]
})

type AnchorProps = JSX.IntrinsicElements['a']
export type LinkProps<R extends RouteBase> = NavigationTarget<R> &
  Omit<
    AnchorProps,
    | 'href'
    | 'children'
    | 'aria-current'
    | 'onClick'
    | 'to'
    | 'search'
    | 'hash'
    | 'replace'
    | 'params'
  > & {
    children?: Child
    active?: 'exact' | 'descendant'
    onClick?: AnchorProps['onClick']
  }
export function Link<R extends RouteBase>(props: LinkProps<R>): JSX.Element {
  const router = currentRouter()
  const href = router.href(props)
  const {
    to: _to,
    params: _params,
    search: _search,
    replace: _replace,
    hash: _hash,
    active,
    children,
    onClick,
    ...anchorProps
  } = props
  void _to
  void _params
  void _search
  void _replace
  void _hash
  return jsx('a', {
    ...anchorProps,
    href,
    get 'aria-current'() {
      const current = new URL(router.location(), 'http://benos.local')
      const destination = new URL(href, 'http://benos.local')
      const exact =
        current.pathname === destination.pathname &&
        current.search === destination.search
      const descendant =
        active === 'descendant' &&
        current.pathname.startsWith(
          destination.pathname.replace(/\/$/, '') + '/',
        )
      return exact || descendant ? 'page' : undefined
    },
    onClick(event: PointerEvent & { currentTarget: HTMLAnchorElement }) {
      onClick?.(event)
      if (
        event.defaultPrevented ||
        event.button !== 0 ||
        event.metaKey ||
        event.ctrlKey ||
        event.shiftKey ||
        event.altKey ||
        (anchorProps.target && anchorProps.target !== '_self') ||
        anchorProps.download !== undefined
      )
        return
      event.preventDefault()
      void router.navigateLink(props)
    },
    children,
  })
}
