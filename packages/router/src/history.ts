import { canonicalUrl } from './path.js'

export interface RouterHistory {
  location(): string
  push(url: string): void
  replace(url: string): void
  listen(listener: (url: string) => void): () => void
  back(): void
  forward(): void
  saveScroll?(): void
  scrollPosition?(): { x: number; y: number } | null
  completeScrollRestoration?(): void
}

export interface MemoryHistory extends RouterHistory {
  entries(): readonly string[]
  index(): number
}

export function memoryHistory(
  options: {
    initialEntries?: readonly string[]
    initialIndex?: number
  } = {},
): MemoryHistory {
  const entries = (options.initialEntries ?? ['/']).map(canonicalUrl)
  if (entries.length === 0) throw new Error('Memory history needs an entry')
  let index = options.initialIndex ?? entries.length - 1
  if (!Number.isInteger(index) || index < 0 || index >= entries.length)
    throw new Error('Memory history initialIndex is out of range')
  const listeners = new Set<(url: string) => void>()
  const current = (): string => {
    const entry = entries[index]
    if (entry === undefined) throw new Error('Memory history entry is missing')
    return entry
  }
  const notify = (): void => {
    for (const listener of listeners) listener(current())
  }
  return {
    location: current,
    entries: () => [...entries],
    index: () => index,
    push(url) {
      entries.splice(index + 1, entries.length, canonicalUrl(url))
      index++
    },
    replace(url) {
      entries[index] = canonicalUrl(url)
    },
    listen(listener) {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
    back() {
      if (index > 0) {
        index--
        notify()
      }
    },
    forward() {
      if (index < entries.length - 1) {
        index++
        notify()
      }
    },
  }
}

export function browserHistory(): RouterHistory {
  const stateKey = '__benosjs_router'
  let keyCounter = 0
  const nextKey = (): string =>
    `${Date.now().toString(36)}-${(++keyCounter).toString(36)}`
  const stateObject = (): Record<string, unknown> => {
    const state = history.state
    return state && typeof state === 'object'
      ? { ...state }
      : state == null
        ? {}
        : { userState: state }
  }
  const metadata = (): { key: string; x: number; y: number } => {
    const state = history.state as Record<string, unknown> | null
    const existing = state?.[stateKey] as
      { key?: unknown; x?: unknown; y?: unknown } | undefined
    if (typeof existing?.key === 'string')
      return {
        key: existing.key,
        x: typeof existing.x === 'number' ? existing.x : 0,
        y: typeof existing.y === 'number' ? existing.y : 0,
      }
    const next = { key: nextKey(), x: 0, y: 0 }
    history.replaceState({ ...stateObject(), [stateKey]: next }, '')
    return next
  }
  const replaceMetadata = (next: { key: string; x: number; y: number }) => {
    history.replaceState({ ...stateObject(), [stateKey]: next }, '')
  }
  const current = (): string =>
    location.pathname + location.search + location.hash
  let restoringPop = false
  return {
    location: current,
    push(url) {
      metadata()
      history.pushState(
        { ...stateObject(), [stateKey]: { key: nextKey(), x: 0, y: 0 } },
        '',
        canonicalUrl(url),
      )
    },
    replace(url) {
      const currentMetadata = metadata()
      history.replaceState(
        { ...stateObject(), [stateKey]: currentMetadata },
        '',
        canonicalUrl(url),
      )
    },
    listen(listener) {
      restoringPop = false
      const onPop = (): void => {
        restoringPop = true
        listener(current())
      }
      metadata()
      const previousRestoration = history.scrollRestoration
      history.scrollRestoration = 'manual'
      const onScroll = (): void => {
        if (restoringPop) return
        const currentMetadata = metadata()
        replaceMetadata({ ...currentMetadata, x: scrollX, y: scrollY })
      }
      addEventListener('popstate', onPop)
      addEventListener('scroll', onScroll, { passive: true })
      const release = (): void => {
        removeEventListener('popstate', onPop)
        removeEventListener('scroll', onScroll)
        history.scrollRestoration = previousRestoration
      }
      return release
    },
    back: () => history.back(),
    forward: () => history.forward(),
    saveScroll() {
      const currentMetadata = metadata()
      replaceMetadata({ ...currentMetadata, x: scrollX, y: scrollY })
    },
    scrollPosition() {
      const currentMetadata = metadata()
      return { x: currentMetadata.x, y: currentMetadata.y }
    },
    completeScrollRestoration() {
      restoringPop = false
    },
  }
}
