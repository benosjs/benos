/**
 * The request-local tree the server host builds before serializing. It is a
 * doubly linked list per parent so inserts and removals stay O(1) for large
 * keyed lists, and it has no DOM identity: no instanceof, no globals.
 */

export type Namespace = 'html' | 'svg' | 'mathml'

interface Linked {
  parent: SContainer | null
  prev: SNode | null
  next: SNode | null
}

export interface SElement extends Linked {
  readonly kind: 1
  readonly tag: string
  readonly ns: Namespace
  /** Attribute values by name; a plain object allocates less than a Map. */
  readonly attrs: Record<string, string | undefined>
  first: SNode | null
  last: SNode | null
}

export interface SText extends Linked {
  readonly kind: 3
  data: string
}

export interface SComment extends Linked {
  readonly kind: 8
  readonly data: string
}

export interface SFragment {
  readonly kind: 11
  readonly parent: null
  first: SNode | null
  last: SNode | null
}

export type SNode = SElement | SText | SComment
export type SContainer = SElement | SFragment

export function fragment(): SFragment {
  return { kind: 11, parent: null, first: null, last: null }
}

export function element(tag: string, ns: Namespace): SElement {
  return {
    kind: 1,
    tag,
    ns,
    attrs: {},
    first: null,
    last: null,
    parent: null,
    prev: null,
    next: null,
  }
}

export function text(data: string): SText {
  return { kind: 3, data, parent: null, prev: null, next: null }
}

export function comment(data: string): SComment {
  return { kind: 8, data, parent: null, prev: null, next: null }
}

/** Inserts before `before`, or appends; `before`'s own parent wins. */
export function insert(
  parent: SContainer,
  node: SNode,
  before: SNode | null,
): void {
  if (node.parent) remove(node)
  const target = before?.parent ?? parent
  node.parent = target
  if (before) {
    node.next = before
    node.prev = before.prev
    if (before.prev) before.prev.next = node
    else target.first = node
    before.prev = node
  } else {
    node.prev = target.last
    node.next = null
    if (target.last) target.last.next = node
    else target.first = node
    target.last = node
  }
}

export function remove(node: SNode): void {
  const parent = node.parent
  if (!parent) return
  if (node.prev) node.prev.next = node.next
  else parent.first = node.next
  if (node.next) node.next.prev = node.prev
  else parent.last = node.prev
  node.parent = null
  node.prev = null
  node.next = null
}

export function childrenOf(parent: SContainer): SNode[] {
  const nodes: SNode[] = []
  for (let node = parent.first; node; node = node.next) nodes.push(node)
  return nodes
}

/** Moves every child of `source` before `before` in `target`. */
export function moveChildren(
  source: SContainer,
  target: SContainer,
  before: SNode | null,
): SNode[] {
  const nodes = childrenOf(source)
  for (const node of nodes) insert(target, node, before)
  return nodes
}
