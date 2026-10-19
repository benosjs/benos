type Name<S extends string> = S extends `:${infer N}` | `*${infer N}`
  ? N
  : never
type Names<P extends string> = P extends `${infer Head}/${infer Tail}`
  ? Name<Head> | Names<Tail>
  : Name<P>

export type PathParams<P extends string> = { [K in Names<P>]: string }

type ValidSegment<S extends string> = S extends ':' | '*'
  ? false
  : S extends ''
    ? false
    : S extends `*${string}`
      ? true
      : S extends `:${string}`
        ? true
        : S extends `${string}:${string}` | `${string}*${string}`
          ? false
          : true
type ValidSegments<
  P extends string,
  Seen extends string = never,
> = P extends `${infer Head}/${infer Tail}`
  ? Head extends `*${string}`
    ? false
    : ValidSegment<Head> extends true
      ? [Name<Head>] extends [never]
        ? ValidSegments<Tail, Seen>
        : Name<Head> extends Seen
          ? false
          : ValidSegments<Tail, Seen | Name<Head>>
      : false
  : ValidSegment<P> extends true
    ? [Name<P>] extends [never]
      ? true
      : Name<P> extends Seen
        ? false
        : true
    : false
export type ValidPath<P extends string> = string extends P
  ? never
  : P extends '/'
    ? P
    : P extends `/${infer Rest}`
      ? ValidSegments<Rest> extends true
        ? P
        : never
      : never
export type ValidRelative<P extends string> = string extends P
  ? never
  : P extends `/${string}` | ''
    ? never
    : ValidSegments<P> extends true
      ? P
      : never
export type JoinPath<
  Parent extends string,
  Child extends string,
> = Parent extends '/' ? `/${Child}` : `${Parent}/${Child}`

export interface Pattern {
  path: string
  segments: readonly string[]
  score: number
}

export function canonicalUrl(raw: string): string {
  const url = new URL(raw, 'http://benos.local')
  if (url.origin !== 'http://benos.local')
    throw new Error('Router URL must be same-origin and relative')
  url.pathname = url.pathname.replace(/\/+$/, '') || '/'
  return url.pathname + url.search + url.hash
}

export function compilePath(path: string): Pattern {
  if (!path.startsWith('/'))
    throw new Error(`Route path must start with /: ${path}`)
  if (path !== '/' && path.endsWith('/'))
    throw new Error(`Route path has a trailing slash: ${path}`)
  const segments = path === '/' ? [] : path.slice(1).split('/')
  let score = 0
  const names = new Set<string>()
  for (const [index, segment] of segments.entries()) {
    if (!segment) throw new Error(`Route path has an empty segment: ${path}`)
    if (segment.startsWith(':') || segment.startsWith('*')) {
      const name = segment.slice(1)
      if (!name || names.has(name) || !/^[A-Za-z_$][\w$]*$/.test(name))
        throw new Error(`Invalid or duplicate route parameter: ${segment}`)
      if (segment.startsWith('*') && index !== segments.length - 1)
        throw new Error(`Route splat must be terminal: ${path}`)
      names.add(name)
      score += segment.startsWith(':') ? 2 : 1
    } else {
      if (segment.includes(':') || segment.includes('*'))
        throw new Error(`Invalid route segment: ${segment}`)
      score += 3
    }
  }
  return { path, segments, score }
}

export function matchPath(
  pattern: Pattern,
  pathname: string,
  caseSensitive: boolean,
): Record<string, string> | null {
  const raw = pathname === '/' ? [] : pathname.slice(1).split('/')
  const result: Record<string, string> = {}
  let index = 0
  for (const segment of pattern.segments) {
    if (segment.startsWith('*')) {
      if (index === raw.length) return null
      result[segment.slice(1)] = raw
        .slice(index)
        .map((part) => decodeURIComponent(part))
        .join('/')
      index = raw.length
      break
    }
    const part = raw[index]
    if (part === undefined) return null
    const decoded = decodeURIComponent(part)
    if (segment.startsWith(':')) result[segment.slice(1)] = decoded
    else if (
      caseSensitive
        ? decoded !== segment
        : decoded.toLowerCase() !== segment.toLowerCase()
    )
      return null
    index++
  }
  return index === raw.length ? result : null
}

export function formatPath(
  pattern: Pattern,
  params: Record<string, string> | undefined,
): string {
  const used = new Set<string>()
  const parts = pattern.segments.map((segment) => {
    if (!segment.startsWith(':') && !segment.startsWith('*')) return segment
    const name = segment.slice(1)
    const value = params?.[name]
    if (!value) throw new Error(`Missing route parameter: ${name}`)
    used.add(name)
    if (segment.startsWith('*'))
      return value.split('/').map(encodeURIComponent).join('/')
    return encodeURIComponent(value)
  })
  for (const name of Object.keys(params ?? {}))
    if (!used.has(name)) throw new Error(`Unknown route parameter: ${name}`)
  return '/' + parts.join('/')
}
