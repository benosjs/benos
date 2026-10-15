import {
  batch,
  createContext,
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
export type MatchHandle<P extends string, S> = {
  params: ReadonlySignal<Readonly<PathParams<P>>>
} & MaybeSearch<S>

interface RouteBase {
  readonly path: string
  readonly codec?: SearchCodec<unknown>
  match(): unknown
}
export interface RouteRef<P extends string, S = never> extends RouteBase {
  readonly path: P
  match(): MatchHandle<P, S>
}

type MatchContextValue = {
  ref: RouteBase | null
  handle: MatchHandle<string, unknown>
} | null
const matchContext = createContext<MatchContextValue>(null)
type ChildPath<Parent extends RouteBase, C extends string> = C &
  ValidRelative<C> &
  (ValidPath<JoinPath<Parent['path'], C>> extends never ? never : C)

export function route<const P extends string>(
  path: P & ValidPath<P>,
): RouteRef<P>
export function route<const P extends string, S>(
  path: P & ValidPath<P>,
  options: { search: SearchCodec<S> },
): RouteRef<P, S>
export function route<const Parent extends RouteBase, const C extends string>(
  path: ChildPath<Parent, C>,
  options: { parent: Parent },
): RouteRef<JoinPath<Parent['path'], C>>
export function route<
  const Parent extends RouteBase,
  const C extends string,
  S,
>(
  path: ChildPath<Parent, C>,
  options: { parent: Parent; search: SearchCodec<S> },
): RouteRef<JoinPath<Parent['path'], C>, S>
export function route(
  path: string,
  options: {
    parent?: RouteBase
    search?: {
      parse(raw: URLSearchParams): unknown
      stringify(value: never): URLSearchParams
    }
  } = {},
): RouteRef<string, unknown> {
  const fullPath = options.parent
    ? options.parent.path === '/'
      ? `/${path}`
      : `${options.parent.path}/${path}`
    : path
  compilePath(fullPath)
  return Object.freeze({
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
  })
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
}
export interface CommittedMatch {
  readonly route: RouteBase | null
  readonly params: Readonly<Record<string, string>>
  readonly search: unknown
}
interface ActiveMatch {
  route: RouteBase | null
  registered: Registered
  handle: MatchHandle<string, unknown>
  setParams: Signal<Readonly<Record<string, string>>>
  setSearch: Signal<unknown>
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
  readonly notFound: (() => Child) | undefined
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
      const current: Registered = {
        node,
        pattern,
        branch: [],
        order: candidates.length,
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
  const location = signal(history.location())
  const navigationState = signal<NavigationState>({ status: 'idle' })
  const active = signal<readonly ActiveMatch[]>([])
  const matches = signal<readonly CommittedMatch[]>([])
  const ready = signal(false)
  let generation = 0
  let mounted = 0
  let unlisten: (() => void) | null = null

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
  const commit = (
    url: string,
    branch: readonly Registered[],
    params: Record<string, string>,
    parsed: readonly unknown[],
  ): void => {
    const previous = active()
    const updates: Array<() => void> = []
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
        })
        return prior
      }
      const setParams = signal<Readonly<Record<string, string>>>(ownParams)
      const setSearch = signal<unknown>(parsed[index])
      const handle = {
        params: setParams as ReadonlySignal<Readonly<Record<string, string>>>,
        search: setSearch as ReadonlySignal<unknown>,
      }
      return {
        route: record.node.ref,
        registered: record,
        handle,
        setParams,
        setSearch,
      }
    })
    batch(() => {
      for (const update of updates) update()
      location.set(url)
      active.set(next)
      matches.set(
        next.map(({ route, setParams, setSearch }) => ({
          route,
          params: setParams(),
          search: setSearch(),
        })),
      )
      navigationState.set({ status: 'idle' })
      ready.set(true)
    })
  }

  const navigateUrl = async (
    input: string,
    mode: 'push' | 'replace' | 'pop' | 'initial',
    reason: 'link' | 'programmatic' | 'pop',
  ): Promise<NavigationResult> => {
    const id = ++generation
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
          await Promise.all(selected.branch.map(ensureComponent))
          if (id !== generation) return { status: 'superseded' }
          const rawSearch = new URL(url, 'http://benos.local').searchParams
          const parsed = selected.branch.map((record) =>
            record.node.ref?.codec
              ? freezeSnapshot(record.node.ref.codec.parse(rawSearch))
              : undefined,
          )
          if (mode === 'push' && !redirected) history.push(url)
          else if (
            mode === 'replace' ||
            redirected ||
            ((mode === 'initial' || mode === 'pop') &&
              history.location() !== url)
          )
            history.replace(url)
          commit(url, selected.branch, selected.params, parsed)
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
      if (id === generation) navigationState.set({ status: 'idle' })
      throw error
    }
  }
  const router: RouterInternal = {
    location,
    navigation: navigationState,
    matches,
    active,
    ready,
    notFound: options.notFound,
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
          generation++
          unlisten?.()
          unlisten = null
        }
      }
    },
    dispose() {
      generation++
      mounted = 0
      unlisten?.()
      unlisten = null
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
  return routerContext.Provider({
    value: { router, depth: 0 },
    children: jsx(Outlet, {}),
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
  let stage: ReturnType<typeof prepareInternalStage> | null = null
  createRenderEffect(() => {
    const match = context.router.active()[context.depth]
    const ready = context.router.ready()
    const record = match?.registered ?? null
    if (current === record && (record || !ready)) return
    stage?.dispose()
    stage = null
    current = record
    if (match) {
      const component = record?.component ?? record?.node.component
      if (component)
        stage = runWithOwner(owner, () =>
          prepareInternalStage(
            () =>
              routerContext.Provider({
                value: { router: context.router, depth: context.depth + 1 },
                children: () => [
                  matchContext.Provider({
                    value: {
                      ref: record?.node.ref ?? null,
                      handle: match.handle,
                    },
                    children: jsx(component, {}),
                  }),
                ],
              }) as Child,
            parent,
          ),
        )
    } else if (context.depth === 0 && ready) {
      const notFound = context.router.notFound
      if (notFound)
        stage = runWithOwner(owner, () =>
          prepareInternalStage(notFound, parent),
        )
    }
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
