import { canonicalUrl } from './path.js'

export interface RouterHistory {
  location(): string
  push(url: string): void
  replace(url: string): void
  listen(listener: (url: string) => void): () => void
  back(): void
  forward(): void
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
  const current = (): string =>
    location.pathname + location.search + location.hash
  return {
    location: current,
    push(url) {
      history.pushState(history.state, '', canonicalUrl(url))
    },
    replace(url) {
      history.replaceState(history.state, '', canonicalUrl(url))
    },
    listen(listener) {
      const onPop = (): void => listener(current())
      addEventListener('popstate', onPop)
      return () => removeEventListener('popstate', onPop)
    },
    back: () => history.back(),
    forward: () => history.forward(),
  }
}
