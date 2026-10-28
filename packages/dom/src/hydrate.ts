/**
 * `hydrate`: claims server-rendered DOM for the same app, reusing node
 * identity. The DOM renderer's creation sites ask the claim hook here for the
 * node at each position; everything that knows the marker grammar lives in
 * this entry, so client-only apps never load it.
 */
import '@benosjs/dom'
import { createRoot, onCleanup } from '@benosjs/core'
import {
  createInternalOwner,
  internalRequest,
  notifyMount,
  runWithOwner,
  setInternalOwnerGate,
  type InternalOwner,
  type InternalRequest,
} from '@benosjs/core/internal'
import type { Child, TemplatePlan } from '@benosjs/dom'

export interface HydrateOptions {
  /** Distinguishes roots on one page; default `"0"`. */
  rootId?: string
  /** The payload JSON, instead of the `<script data-benos>` lookup. */
  payload?: string
  onMismatch?: (info: HydrationMismatch) => void
}

export interface HydrationMismatch {
  rootId: string
  /** Element path from the host to the failing position. */
  path: string
  expected: string
  actual: string
  /** `boundary`: the nearest range client-renders; `root`: the whole app. */
  recovered: 'boundary' | 'root'
}

type ClaimKind =
  | 'text'
  | 'comment'
  | 'marker'
  | 'element'
  | 'template'
  | 'direct'
  | 'stage'
  | 'write'
type Claim = (
  kind: ClaimKind,
  parent: Node,
  before: Node | null,
  arg?: unknown,
) => unknown
interface Registry {
  mountValue: (
    value: Child,
    parent: Node,
    before: Node | null,
    owner: InternalOwner,
  ) => { nodes: Node[]; owner: InternalOwner }
  setClaim: (next: Claim | null) => void
}
type Instruction = TemplatePlan['nodes'][number]

const registryValue = (
  globalThis as typeof globalThis & { __benosDomHydrate?: Registry }
).__benosDomHydrate
if (!registryValue) throw new Error('Benos DOM hydration is unavailable')
const registry: Registry = registryValue

function drop(node: Node): void {
  node.parentNode?.removeChild(node)
}
const development = process.env.NODE_ENV !== 'production'
const COMMENT = 8
const TEXT = 3
const ELEMENT = 1

function isComment(
  node: Node | null | undefined,
  data: string,
): node is Comment {
  return node?.nodeType === COMMENT && (node as Comment).data === data
}

function isOpen(node: Node | null | undefined): node is Comment {
  return (
    node?.nodeType === COMMENT && /^b(?::\d+)?$/.test((node as Comment).data)
  )
}

/** The `<!--/b-->` that closes `open`, skipping nested pairs. */
function closeOf(open: Comment): Comment | null {
  let depth = 0
  for (let node = open.nextSibling; node; node = node.nextSibling) {
    if (isOpen(node)) depth++
    else if (isComment(node, '/b')) {
      if (depth === 0) return node
      depth--
    }
  }
  return null
}

function describe(node: Node | null): string {
  if (!node) return 'end of range'
  if (node.nodeType === TEXT) return 'text'
  if (node.nodeType === COMMENT)
    return `comment <!--${(node as Comment).data}-->`
  return `element <${(node as Element).localName}>`
}

function readPayload(
  host: ParentNode,
  rootId: string,
  override: string | undefined,
): { resources: Map<string, unknown>; queries: Map<string, unknown> } {
  const resources = new Map<string, unknown>()
  const queries = new Map<string, unknown>()
  let text = override
  if (text === undefined) {
    const selector = `script[type="application/json"][data-benos="${rootId}"]`
    const script =
      host.querySelector(selector) ??
      (host as Node).ownerDocument?.querySelector(selector) ??
      null
    text = script?.textContent ?? undefined
    if (script) drop(script)
  }
  if (text === undefined) return { resources, queries }
  let parsed: unknown
  try {
    parsed = JSON.parse(text)
  } catch {
    return { resources, queries }
  }
  const payload = parsed as { v?: unknown; r?: unknown; q?: unknown }
  if (!payload || payload.v !== 1) return { resources, queries }
  const fill = (entries: unknown, into: Map<string, unknown>): void => {
    if (!Array.isArray(entries)) return
    for (const entry of entries) {
      if (
        Array.isArray(entry) &&
        entry.length === 3 &&
        typeof entry[0] === 'string' &&
        typeof entry[1] === 'string'
      )
        into.set(`${entry[0]}\u0000${entry[1]}`, entry[2])
    }
  }
  fill(payload.r, resources)
  fill(payload.q, queries)
  return { resources, queries }
}

/**
 * One hydration's claim state. `cursor` maps a position key (the `before`
 * node, or the parent when appending) to the next unclaimed sibling; a key
 * with no entry is not a hydrated position, so the renderer creates nodes.
 */
function createClaimer(
  rootId: string,
  host: Node,
  onMismatch: ((info: HydrationMismatch) => void) | undefined,
): {
  claim: Claim
  cursor: WeakMap<Node, Node | null>
  sweep(nodes: Node[]): void
} {
  const cursor = new WeakMap<Node, Node | null>()
  /** Keys whose remainder was client rendered; later claims there are silent. */
  const recovered = new WeakSet<Node>()
  /** Elements the server rendered; their first attribute write is skipped. */
  const claimedElements = new WeakSet<Node>()
  const leftover = /^(?:\/?[bi]|b:\d+)$/
  const stages = new WeakMap<
    Node,
    {
      open: Comment
      close: Comment
      index: number
      count: number
      claimed: boolean
    }[]
  >()

  const pathOf = (parent: Node): string => {
    const names: string[] = []
    for (
      let node: Node | null = parent;
      node && node !== host && node.nodeType === ELEMENT;
      node = node.parentNode
    ) {
      let index = 0
      for (
        let sibling = (node as Element).previousElementSibling;
        sibling;
        sibling = sibling.previousElementSibling
      )
        index++
      names.unshift(`${(node as Element).localName}${index ? `:${index}` : ''}`)
    }
    return names.join(' > ') || 'root'
  }

  /** Reports a mismatch and client-renders the rest of the key's range. */
  const recover = (
    key: Node,
    parent: Node,
    before: Node | null,
    from: Node | null,
    expected: string,
    actual: Node | null,
  ): undefined => {
    const info: HydrationMismatch = {
      rootId,
      path: pathOf(parent),
      expected,
      actual: describe(actual),
      recovered:
        key === host || (before === null && parent === host)
          ? 'root'
          : 'boundary',
    }
    if (development)
      console.error(
        `Benos hydration mismatch at ${info.path}: expected ${expected}, found ${info.actual}; the rest of this range is client rendered.`,
      )
    onMismatch?.(info)
    recovered.add(key)
    return discard(key, from, before)
  }

  /** The next unclaimed node at a key, with keyed-item wrappers removed. */
  const peek = (key: Node, before: Node | null): Node | null | undefined => {
    let next = cursor.get(key)
    if (next === undefined || recovered.has(key)) return undefined
    while (next && next !== before && next.nodeType === COMMENT) {
      const data = (next as Comment).data
      if (data !== 'i' && data !== '/i') break
      const gone = next
      next = next.nextSibling
      drop(gone)
    }
    cursor.set(key, next)
    return next
  }

  /** Removes a key's nodes from `from` and leaves the range to the renderer. */
  const discard = (
    key: Node,
    from: Node | null,
    before: Node | null,
  ): undefined => {
    for (let node = from; node && node !== before;) {
      const next: Node | null = node.nextSibling
      drop(node)
      node = next
    }
    cursor.set(key, before)
    return undefined
  }

  const take = (key: Node, node: Node): void => {
    cursor.set(key, node.nextSibling)
  }

  const claimText = (
    parent: Node,
    before: Node | null,
    value: string,
  ): Text | undefined => {
    const key = before ?? parent
    const next = peek(key, before)
    if (next === undefined) return undefined
    if (next && next !== before && next.nodeType === TEXT) {
      take(key, next)
      if ((next as Text).data !== value) {
        if (development)
          console.warn(
            `Benos hydration text differs at ${pathOf(parent)}: server "${(next as Text).data}", client "${value}".`,
          )
        ;(next as Text).data = value
      }
      return next as Text
    }
    if (value === '') {
      // The parser drops an empty text node; create it in place.
      const text = (
        parent.ownerDocument ?? (parent as Document)
      ).createTextNode('')
      parent.insertBefore(text, next === before ? before : next)
      return text
    }
    return recover(
      key,
      parent,
      before,
      next,
      'text',
      next === before ? null : next,
    )
  }

  const claimElement = (
    parent: Node,
    before: Node | null,
    tag: string,
    namespace: string,
  ): Element | undefined => {
    const key = before ?? parent
    const next = peek(key, before)
    if (next === undefined) return undefined
    const element = next !== before ? (next as Element | null) : null
    if (
      element?.nodeType === ELEMENT &&
      element.localName === tag &&
      (namespace === 'html'
        ? element.namespaceURI === 'http://www.w3.org/1999/xhtml'
        : namespace === 'svg'
          ? element.namespaceURI === 'http://www.w3.org/2000/svg'
          : element.namespaceURI === 'http://www.w3.org/1998/Math/MathML')
    ) {
      take(key, element)
      cursor.set(element, element.firstChild)
      claimedElements.add(element)
      return element
    }
    return recover(key, parent, before, next, `element <${tag}>`, element)
  }

  /** Claims a slot pair: the close becomes the slot marker. */
  const claimMarker = (
    parent: Node,
    before: Node | null,
  ): Comment | undefined => {
    const key = before ?? parent
    const next = peek(key, before)
    if (next === undefined) return undefined
    const open = next !== before && isComment(next, 'b') ? next : null
    const close = open && closeOf(open)
    if (!open || !close)
      return recover(
        key,
        parent,
        before,
        next,
        'slot',
        next === before ? null : next,
      )
    take(key, close)
    cursor.set(close, open.nextSibling)
    drop(open)
    close.data = ''
    return close
  }

  /** Claims a plain comment, noting a stage pair that precedes it. */
  const claimComment = (
    parent: Node,
    before: Node | null,
  ): Comment | undefined => {
    const key = before ?? parent
    let next = peek(key, before)
    if (next === undefined) return undefined
    let pair: { open: Comment; close: Comment; index: number } | null = null
    if (next !== before && isOpen(next) && (next as Comment).data !== 'b') {
      const close = closeOf(next as Comment)
      if (close) {
        pair = {
          open: next as Comment,
          close,
          index: Number((next as Comment).data.slice(2)),
        }
        next = close.nextSibling
      }
    }
    if (next !== before && isComment(next, '')) {
      take(key, next)
      if (pair) {
        let list = stages.get(parent)
        if (!list) stages.set(parent, (list = []))
        list.push({ ...pair, count: 0, claimed: false })
      }
      return next
    }
    return recover(
      key,
      parent,
      before,
      cursor.get(key) ?? null,
      'comment',
      next === before ? null : (next ?? null),
    )
  }

  const claimStage = (target: Node): { before: Node } | undefined => {
    const list = stages.get(target)
    const record = list?.[list.length - 1]
    if (!record || record.claimed) return undefined
    const index = record.count++
    if (index !== record.index) return undefined
    record.claimed = true
    cursor.set(record.close, record.open.nextSibling)
    drop(record.open)
    return { before: record.close }
  }

  class Mismatch extends Error {}

  const instruction = (
    item: Instruction,
    parent: Node,
    before: Node | null,
    slots: Node[],
  ): Node => {
    let node: Node | undefined
    if (item.op === 'text') {
      if (item.slot === undefined)
        node = claimText(parent, before, item.value ?? '')
      else {
        // A dynamic text slot: `<!--b-->text<!--/b-->`, or bare text inside
        // RCDATA where the server emits no markers.
        const key = before ?? parent
        const next = peek(key, before)
        if (next !== before && isComment(next, 'b')) {
          const close = closeOf(next)
          if (!close) throw new Mismatch()
          drop(next)
          const inner = close.previousSibling
          if (inner && inner.nodeType === TEXT && inner !== before) node = inner
          else {
            node = (parent.ownerDocument as Document).createTextNode('')
            parent.insertBefore(node, close)
          }
          take(key, close)
          drop(close)
        } else node = claimText(parent, before, '')
      }
    } else if (item.op === 'anchor') node = claimMarker(parent, before)
    else {
      const element = claimElement(
        parent,
        before,
        item.tag ?? 'div',
        item.ns ?? 'html',
      )
      if (element) {
        for (const child of item.children ?? [])
          instruction(child, element, null, slots)
        const rest = cursor.get(element)
        if (rest) recover(element, element, null, rest, 'end of element', rest)
      }
      node = element
    }
    if (!node) throw new Mismatch()
    if (item.slot !== undefined) slots[item.slot] = node
    return node
  }

  const claimTemplate = (
    plan: TemplatePlan,
    parent: Node,
    before: Node | null,
  ): { nodes: Node[]; slots: Node[] } | undefined => {
    const key = before ?? parent
    const start = peek(key, before)
    if (start === undefined) return undefined
    const nodes: Node[] = []
    const slots: Node[] = []
    try {
      for (const item of plan.nodes)
        nodes.push(instruction(item, parent, before, slots))
      return { nodes, slots }
    } catch (error) {
      if (!(error instanceof Mismatch)) throw error
      // The claimed part has no bindings yet: drop the whole range and let
      // the renderer clone the template.
      return discard(key, start, before)
    }
  }

  /** Claims a direct template by walking its parsed prototype. */
  const claimDirect = (
    content: DocumentFragment,
    parent: Node,
    before: Node | null,
  ): { root: Element; at: (path: readonly number[]) => Node } | undefined => {
    const key = before ?? parent
    const start = peek(key, before)
    if (start === undefined) return undefined
    const map = new Map<Node, Node>()
    const like = (proto: Node, into: Node, at: Node | null): void => {
      let node: Node | undefined
      if (proto.nodeType === ELEMENT) {
        const element = claimElement(
          into,
          at,
          (proto as Element).localName,
          (proto as Element).namespaceURI === 'http://www.w3.org/2000/svg'
            ? 'svg'
            : (proto as Element).namespaceURI ===
                'http://www.w3.org/1998/Math/MathML'
              ? 'mathml'
              : 'html',
        )
        if (element) {
          for (let child = proto.firstChild; child; child = child.nextSibling)
            like(child, element, null)
          const rest = cursor.get(element)
          if (rest)
            recover(element, element, null, rest, 'end of element', rest)
        }
        node = element
      } else if (proto.nodeType === TEXT)
        node = claimText(into, at, (proto as Text).data)
      else node = claimMarker(into, at)
      if (!node) throw new Mismatch()
      map.set(proto, node)
    }
    try {
      const protoRoot = content.firstChild
      if (!protoRoot) throw new Mismatch()
      like(protoRoot, parent, before)
      const root = map.get(protoRoot) as Element
      // Binding paths are relative to the template's root element.
      const at = (path: readonly number[]): Node => {
        let proto: Node = protoRoot
        for (const index of path) {
          const child = proto.childNodes.item(index)
          if (!child) throw new Error('Invalid Benos template slot path')
          proto = child
        }
        const claimed = map.get(proto)
        if (!claimed) throw new Error('Unclaimed Benos template node')
        return claimed
      }
      return { root, at }
    } catch (error) {
      if (!(error instanceof Mismatch)) throw error
      return discard(key, start, before)
    }
  }

  const claim: Claim = (kind, parent, before, arg) => {
    if (kind === 'write') return claimedElements.has(parent)
    if (kind === 'text') return claimText(parent, before, arg as string)
    if (kind === 'comment') return claimComment(parent, before)
    if (kind === 'marker') return claimMarker(parent, before)
    if (kind === 'element') {
      const [tag, namespace] = arg as [string, string]
      return claimElement(parent, before, tag, namespace)
    }
    if (kind === 'template')
      return claimTemplate(arg as TemplatePlan, parent, before)
    if (kind === 'direct')
      return claimDirect(arg as DocumentFragment, parent, before)
    return claimStage(parent)
  }

  /** Removes marker comments the walk left behind (keyed-item wrappers). */
  const sweep = (nodes: Node[]): void => {
    const document = host.ownerDocument ?? (host as Document)
    for (const node of nodes) {
      if (node.nodeType === COMMENT) {
        if (leftover.test((node as Comment).data)) drop(node)
        continue
      }
      if (node.nodeType !== ELEMENT) continue
      const walker = document.createTreeWalker(node, 0x80 /* SHOW_COMMENT */)
      const stale: Node[] = []
      for (
        let current = walker.nextNode();
        current;
        current = walker.nextNode()
      )
        if (leftover.test((current as Comment).data)) stale.push(current)
      for (const comment of stale) drop(comment)
    }
  }

  return { claim, cursor, sweep }
}

export function hydrate(
  app: () => Child,
  host: Element | DocumentFragment | ShadowRoot,
  options: HydrateOptions = {},
): () => void {
  const rootId = options.rootId ?? '0'
  let open: Comment | null = null
  let close: Comment | null = null
  for (let node = host.firstChild; node; node = node.nextSibling) {
    if (node.nodeType !== COMMENT) continue
    const data = (node as Comment).data
    if (!open && data.startsWith(`benos:${rootId}:`)) open = node as Comment
    else if (open && data === `/benos:${rootId}`) {
      close = node as Comment
      break
    }
  }
  const versioned = open?.data === `benos:${rootId}:1`
  if (open && close && !versioned) {
    // A different protocol: discard the server markup and client render.
    for (let node: Node | null = open; node;) {
      const next: Node | null = node.nextSibling
      drop(node)
      if (node === close) break
      node = next
    }
  }
  const claimable = Boolean(open && close && versioned)
  if (!claimable) {
    const info: HydrationMismatch = {
      rootId,
      path: 'root',
      expected: `root markers for ${rootId} (version 1)`,
      actual: open ? `comment <!--${open.data}-->` : 'no root markers',
      recovered: 'root',
    }
    if (development)
      console.error(
        `Benos hydration found ${info.actual}; the app is client rendered.`,
      )
    options.onMismatch?.(info)
  }
  const { resources, queries } = readPayload(host, rootId, options.payload)
  // Loaders and opted-in data the app starts are awaited before the claim
  // ends, so routed content that commits after them can still claim.
  const pending = new Set<Promise<unknown>>()
  const request: InternalRequest = {
    id: rootId,
    mode: 'hydrate',
    resources,
    queries,
    track(promise) {
      pending.add(promise)
      const done = (): void => {
        pending.delete(promise)
      }
      promise.then(done, done)
    },
  }
  const claimer = createClaimer(rootId, host, options.onMismatch)
  let disposeRoot = (): void => undefined
  let disposed = false
  let rootRange: { nodes: Node[] } = { nodes: [] }
  let rootOwner!: InternalOwner
  try {
    createRoot((dispose) => {
      disposeRoot = dispose
      internalRequest(request)
      rootOwner = createInternalOwner(
        'component',
        () =>
          rootRange.nodes.length > 0 &&
          rootRange.nodes.every((node) => node.isConnected),
      )
      // Gate 1 holds user effects and onMount until the claim is complete.
      setInternalOwnerGate(rootOwner, 1)
      if (claimable) {
        claimer.cursor.set(close as Comment, (open as Comment).nextSibling)
        registry.setClaim(claimer.claim)
      }
      let output!: Child
      runWithOwner(rootOwner, () => {
        output = app()
      })
      rootRange = runWithOwner(rootOwner, () =>
        registry.mountValue(output, host, claimable ? close : null, rootOwner),
      )
      runWithOwner(rootOwner, () =>
        onCleanup(() => {
          for (const node of rootRange.nodes) node.parentNode?.removeChild(node)
        }),
      )
    })
  } catch (error) {
    registry.setClaim(null)
    throw error
  }
  const finish = (): void => {
    registry.setClaim(null)
    if (disposed) return
    if (claimable) {
      const rest = claimer.cursor.get(close as Comment)
      if (rest && rest !== close) {
        const info: HydrationMismatch = {
          rootId,
          path: 'root',
          expected: 'end of root',
          actual: describe(rest),
          recovered: 'boundary',
        }
        if (development)
          console.error(
            `Benos hydration left server nodes after the app: ${info.actual}; they are removed.`,
          )
        options.onMismatch?.(info)
        for (let node: Node | null = rest; node && node !== close;) {
          const next: Node | null = node.nextSibling
          drop(node)
          node = next
        }
      }
      drop(open as Comment)
      drop(close as Comment)
      claimer.sweep(rootRange.nodes)
    }
    setInternalOwnerGate(rootOwner, 0)
    notifyMount(rootOwner)
  }
  if (pending.size === 0) finish()
  else {
    const settle = async (): Promise<void> => {
      while (pending.size && !disposed) await Promise.allSettled([...pending])
      finish()
    }
    void settle()
  }
  return () => {
    disposed = true
    disposeRoot()
  }
}
