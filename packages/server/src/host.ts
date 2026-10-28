/**
 * The server host: a second renderer over the descriptors and template plans
 * the DOM renderer consumes, building the request-local tree in nodes.ts.
 * It mirrors the DOM renderer's owner kinds, creation order, and slot
 * ordinals so owner paths (and therefore `createUniqueId`) match the client.
 */
import { computed, onCleanup, signal, untrack } from '@benosjs/core'
import {
  claimInternalOrdinal,
  createInternalOwner,
  createRenderEffect,
  disposeInternalOwner,
  getInternalProviderOwner,
  reportInternalError,
  runWithOwner,
  setInternalErrorHandler,
  setInternalOwnerGate,
  type InternalOwner,
} from '@benosjs/core/internal'
import {
  Dynamic,
  ErrorBoundary,
  For,
  Match,
  Portal,
  Show,
  Switch,
  jsx,
  type Child,
  type Component,
  type InternalHost,
  type TemplatePlan,
  type TemplateScope,
} from '@benosjs/dom'
import type { DirectTemplateDescriptor } from '@benosjs/dom/internal'
import {
  comment,
  element,
  fragment,
  insert,
  moveChildren,
  remove,
  text,
  type Namespace,
  type SComment,
  type SContainer,
  type SElement,
  type SNode,
} from './nodes.js'
import {
  noscriptElements,
  rawTextElements,
  rcdataElements,
} from './serialize.js'

type Props = Record<PropertyKey, unknown>
interface ElementDescriptor {
  kind: 'element'
  tag: string
  props: Props
}
interface ComponentDescriptor {
  kind: 'component'
  component: Component
  props: Props
}
interface TemplateDescriptor {
  kind: 'template'
  plan: TemplatePlan
  setup: (scope: TemplateScope) => void
}
type Instruction = TemplatePlan['nodes'][number]
type InternalControl = (
  props: Props,
  parent: Node,
  before: Node | null,
  owner: InternalOwner,
  host: InternalHost,
) => Node[]

const internalControls = (
  globalThis as typeof globalThis & {
    __benosDomControls?: WeakMap<object, InternalControl>
  }
).__benosDomControls
const development = process.env.NODE_ENV !== 'production'

export interface Range {
  nodes: SNode[]
  owner: InternalOwner
}
interface Mounted {
  range: Range
  owner: InternalOwner
}
interface Slot {
  parent: SContainer
  /** The opening `<!--b-->`; null inside RCDATA, where markers cannot parse. */
  open: SComment | null
  /** The closing `<!--/b-->`, which hydration turns into the DOM slot marker. */
  marker: SComment
  current: Mounted | null
  range: Range
  initialized: boolean
  value: Child
  ordinal: number
}

const booleanAttributes = new Set([
  'allowfullscreen',
  'async',
  'autofocus',
  'autoplay',
  'checked',
  'controls',
  'default',
  'defer',
  'disabled',
  'formnovalidate',
  'hidden',
  'ismap',
  'itemscope',
  'loop',
  'multiple',
  'muted',
  'nomodule',
  'novalidate',
  'open',
  'playsinline',
  'readonly',
  'required',
  'reversed',
  'selected',
])
const urlAttributes = new Set([
  'href',
  'src',
  'action',
  'formaction',
  'poster',
  'xlink:href',
])

function readProp(props: Props, key: PropertyKey): unknown {
  return untrack(() => props[key])
}

function isGetter(props: Props, key: PropertyKey): boolean {
  return Boolean(Object.getOwnPropertyDescriptor(props, key)?.get)
}

function isEvent(key: PropertyKey): boolean {
  return (
    typeof key === 'string' &&
    (key.startsWith('on:') || (key.startsWith('on') && key.length > 2))
  )
}

function namespaceFor(tag: string, parent: Namespace): Namespace {
  if (tag === 'svg') return 'svg'
  if (tag === 'math') return 'mathml'
  return parent
}

function parentNamespace(parent: SContainer): Namespace {
  if (parent.kind !== 1) return 'html'
  return parent.tag === 'foreignObject' ? 'html' : parent.ns
}

function isDangerousUrl(value: string): boolean {
  let normalized = value.trim().toLowerCase()
  try {
    normalized = decodeURIComponent(normalized).trim()
  } catch {
    // Keep the original when the value is not valid URI encoding.
  }
  return (
    normalized.startsWith('javascript:') || normalized.startsWith('vbscript:')
  )
}

/** Mirrors the DOM renderer's attribute rules, producing attribute strings. */
function applyOneProp(
  target: SElement,
  key: PropertyKey,
  value: unknown,
): void {
  if (typeof key !== 'string') return
  const lower = key.toLowerCase()
  if (key === 'selectedIndex') {
    if (development)
      console.warn(
        'selectedIndex cannot be serialized; it is ignored on the server',
      )
    return
  }
  if (booleanAttributes.has(lower)) {
    if (value) target.attrs[key] = ''
    else target.attrs[key] = undefined
    return
  }
  if (value === null || value === undefined) {
    target.attrs[key] = undefined
    return
  }
  if (key === 'style' && typeof value === 'object') {
    let css = ''
    for (const name of Reflect.ownKeys(value)) {
      if (typeof name !== 'string') continue
      const next = (value as Record<string, unknown>)[name]
      if (next === null || next === undefined) continue
      css += `${css ? ' ' : ''}${name}: ${String(next)};`
    }
    if (css) target.attrs.style = css
    else target.attrs.style = undefined
    return
  }
  if (urlAttributes.has(lower) && typeof value === 'string') {
    if (isDangerousUrl(value)) {
      target.attrs[key] = undefined
      return
    }
    if (value.trim().toLowerCase().startsWith('data:')) {
      const imageData =
        lower === 'src' &&
        target.tag === 'img' &&
        /^data:image\//i.test(value.trim())
      if (!imageData) {
        target.attrs[key] = undefined
        return
      }
    }
  }
  target.attrs[key] = String(value)
}

function emptyComment(parent: SContainer, before: SNode | null): SNode {
  const node = comment('')
  insert(parent, node, before)
  return node
}

function disposeMounted(mounted: Mounted | null): void {
  if (!mounted) return
  disposeInternalOwner(mounted.owner)
  for (const node of mounted.range.nodes) remove(node)
}

function setSlotRange(slot: Slot): void {
  const nodes = slot.current?.range.nodes ?? []
  slot.range.nodes = slot.open
    ? [slot.open, ...nodes, slot.marker]
    : [...nodes, slot.marker]
}

function createSlot(
  parent: SContainer,
  before: SNode | null,
  owner: InternalOwner,
): Slot {
  const rcdata = parent.kind === 1 && rcdataElements.has(parent.tag)
  const open = rcdata ? null : comment('b')
  const marker = comment(rcdata ? '' : '/b')
  if (open) insert(parent, open, before)
  insert(parent, marker, before)
  if (rcdata) remove(marker)
  const slot: Slot = {
    parent,
    open,
    marker,
    current: null,
    range: { nodes: open ? [open, marker] : [], owner },
    initialized: false,
    value: undefined,
    ordinal: 0,
  }
  runWithOwner(owner, () => {
    slot.ordinal = claimInternalOrdinal()
    onCleanup(() => {
      disposeMounted(slot.current)
      slot.current = null
      if (slot.open) remove(slot.open)
      remove(slot.marker)
      slot.range.nodes = []
    })
  })
  return slot
}

function updateSlot(
  slot: Slot,
  value: Child,
  owner: InternalOwner,
  createBranch: (owner: InternalOwner, before: SNode | null) => Mounted,
): void {
  const currentNode = slot.current?.range.nodes[0]
  if (
    currentNode?.kind === 3 &&
    slot.current?.range.nodes.length === 1 &&
    (typeof value === 'string' || typeof value === 'number')
  ) {
    currentNode.data = String(value)
    slot.value = value
    slot.initialized = true
    return
  }
  if (slot.current && slot.initialized && Object.is(slot.value, value)) return
  disposeMounted(slot.current)
  slot.current = null
  const branch = runWithOwner(owner, () =>
    createInternalOwner('branch', () => false, undefined, slot.ordinal),
  )
  try {
    const before = slot.marker.parent ? slot.marker : null
    slot.current = createBranch(branch, before)
    slot.value = value
    slot.initialized = true
    setSlotRange(slot)
  } catch (error) {
    disposeInternalOwner(branch)
    throw error
  }
}

function createChildMount(
  value: Child,
  parent: SContainer,
  before: SNode | null,
  owner: InternalOwner,
): Mounted {
  return { range: mountValue(value, parent, before, owner), owner }
}

export function mountValue(
  value: Child,
  parent: SContainer,
  before: SNode | null,
  owner: InternalOwner,
  providerHandled = false,
): Range {
  const providerOwner = providerHandled ? null : getInternalProviderOwner(value)
  if (providerOwner)
    return mountValue(value, parent, before, providerOwner, true)
  if (Array.isArray(value)) {
    const values = value.flat(Infinity) as Child[]
    if (values.length === 1) return mountValue(values[0], parent, before, owner)
    const nodes: SNode[] = []
    for (const item of values)
      nodes.push(...mountValue(item, parent, before, owner).nodes)
    if (nodes.length > 0) return { nodes, owner }
    return { nodes: [emptyComment(parent, before)], owner }
  }
  if (value === null || value === undefined || typeof value === 'boolean')
    return { nodes: [emptyComment(parent, before)], owner }
  if (typeof value === 'string' || typeof value === 'number') {
    const node = text(String(value))
    insert(parent, node, before)
    return { nodes: [node], owner }
  }
  if (typeof value !== 'object')
    throw new Error('Unsupported Benos child value')
  const descriptor = value as
    | ElementDescriptor
    | ComponentDescriptor
    | TemplateDescriptor
    | { kind: string }
  if (descriptor.kind === 'element')
    return mountElement(descriptor as ElementDescriptor, parent, before, owner)
  if (descriptor.kind === 'component')
    return mountComponent(
      descriptor as ComponentDescriptor,
      parent,
      before,
      owner,
    )
  if (descriptor.kind === 'template')
    return mountTemplate(
      descriptor as TemplateDescriptor,
      parent,
      before,
      owner,
    )
  if (descriptor.kind === 'direct-template')
    return mountDirectTemplate(
      descriptor as DirectTemplateDescriptor,
      parent,
      before,
      owner,
    )
  throw new Error(`Unsupported Benos descriptor ${String(descriptor.kind)}`)
}

/** The n-th child, as the DOM renderer's `nodeAtPath` counts. */
function nodeAtPath(root: SNode, path: readonly number[]): SNode {
  let node = root
  for (const index of path) {
    if (node.kind !== 1) throw new Error('Invalid Benos template slot path')
    let child = node.first
    for (let i = 0; i < index && child; i++) child = child.next
    if (!child) throw new Error('Invalid Benos template slot path')
    node = child
  }
  return node
}

const decodeEntities = (text: string): string =>
  text.replace(/&(amp|lt|gt);/g, (_, name: string) =>
    name === 'amp' ? '&' : name === 'lt' ? '<' : '>',
  )

/**
 * Builds a direct template's skeleton. The compiler emits only `<tag>`,
 * `</tag>`, escaped text, and `<!---->` child anchors; attributes arrive
 * typed, by path, so no attribute parsing is needed.
 */
function buildSkeleton(html: string, parent: SContainer): SElement {
  const stack: SContainer[] = [parent]
  let root: SElement | null = null
  const tokens = /<!---->|<\/([\w-]+)>|<([\w-]+)>|([^<]+)/g
  for (const match of html.matchAll(tokens)) {
    const current = stack[stack.length - 1] as SContainer
    if (match[0] === '<!---->') insert(current, comment(''), null)
    else if (match[1] !== undefined) stack.pop()
    else if (match[2] !== undefined) {
      const node = element(
        match[2],
        namespaceFor(match[2], parentNamespace(current)),
      )
      insert(current, node, null)
      root ??= node
      stack.push(node)
    } else insert(current, text(decodeEntities(match[3] ?? '')), null)
  }
  if (!root || stack.length !== 1)
    throw new Error('Invalid Benos direct template skeleton')
  return root
}

function mountDirectTemplate(
  descriptor: DirectTemplateDescriptor,
  parent: SContainer,
  before: SNode | null,
  owner: InternalOwner,
): Range {
  const holder = fragment()
  const root = buildSkeleton(descriptor.definition.html, holder)
  for (const attribute of descriptor.definition.attributes) {
    const target = nodeAtPath(root, attribute.path)
    if (target.kind === 1) applyOneProp(target, attribute.name, attribute.value)
  }
  const nodes = moveChildren(holder, before?.parent ?? parent, before)
  const range: Range = { nodes, owner }
  runWithOwner(owner, () => {
    onCleanup(() => {
      for (const node of range.nodes) remove(node)
    })
    // Targets resolve before any anchor becomes a pair, which shifts siblings.
    const targets = descriptor.definition.bindings.map((binding) =>
      nodeAtPath(root, binding.path),
    )
    descriptor.definition.bindings.forEach((binding, index) => {
      const target = targets[index] as SNode
      if (binding.kind === 'attribute') {
        if (target.kind === 1)
          createRenderEffect(() =>
            applyOneProp(
              target,
              binding.name ?? '',
              binding.get(descriptor.values),
            ),
          )
      } else if (binding.kind === 'child') {
        const container = target.kind === 8 ? target.parent : null
        if (!container) return
        // The anchor becomes a slot pair, as a plan anchor does.
        rejectDynamicContent(container, 'children')
        const open = comment('b')
        const close = comment('/b')
        insert(container, open, target)
        insert(container, close, target)
        remove(target)
        const slot: Slot = {
          parent: container,
          open,
          marker: close,
          current: null,
          range: { nodes: [open, close], owner },
          initialized: false,
          value: undefined,
          ordinal: claimInternalOrdinal(),
        }
        onCleanup(() => {
          disposeMounted(slot.current)
          slot.current = null
          remove(open)
          remove(close)
          slot.range.nodes = []
        })
        createRenderEffect(() => {
          const value = binding.get(descriptor.values) as Child
          updateSlot(slot, value, owner, (branch, at) =>
            createChildMount(value, container, at, branch),
          )
        })
      }
      // Events attach on the client only.
    })
  })
  return range
}

function mountElement(
  descriptor: ElementDescriptor,
  parent: SContainer,
  before: SNode | null,
  owner: InternalOwner,
): Range {
  const node = element(
    descriptor.tag,
    namespaceFor(descriptor.tag, parentNamespace(parent)),
  )
  insert(parent, node, before)
  const range: Range = { nodes: [node], owner }
  runWithOwner(owner, () => {
    onCleanup(() => remove(node))
    applyProps(node, descriptor.props, owner)
  })
  return range
}

function applyProps(
  target: SElement,
  props: Props,
  owner: InternalOwner,
): void {
  const keys =
    Object.getPrototypeOf(props) === Object.prototype
      ? Object.keys(props)
      : Reflect.ownKeys(props)
  for (const key of keys) {
    if (key === 'children' || key === 'key' || key === 'ref' || isEvent(key))
      continue
    const update = () => applyOneProp(target, key, props[key])
    if (isGetter(props, key))
      runWithOwner(owner, () => createRenderEffect(update))
    else update()
  }
  if (Object.prototype.hasOwnProperty.call(props, 'children')) {
    if (!isGetter(props, 'children')) {
      const range = mountValue(
        readProp(props, 'children') as Child,
        target,
        null,
        owner,
      )
      runWithOwner(owner, () =>
        onCleanup(() => {
          for (const node of range.nodes) remove(node)
        }),
      )
      return
    }
    rejectDynamicContent(target, 'children')
    const slot = createSlot(target, null, owner)
    runWithOwner(owner, () =>
      createRenderEffect(() => {
        const value = props.children as Child
        updateSlot(slot, value, owner, (branch, at) => ({
          range: mountValue(value, target, at, branch),
          owner: branch,
        }))
      }),
    )
  }
}

/** Raw-text and noscript elements cannot carry markers or late content. */
function rejectDynamicContent(parent: SContainer, what: string): void {
  if (parent.kind !== 1) return
  if (rawTextElements.has(parent.tag) || noscriptElements.has(parent.tag))
    throw new Error(
      `<${parent.tag}> cannot contain dynamic ${what} on the server`,
    )
}

/**
 * Stage pairs carry the stage's ordinal under its parent, counted from the
 * control's marker, so the client claims a Suspense fallback or content only
 * with the stage that produced it.
 */
const stageCounts = new WeakMap<object, number>()

const serverHost: InternalHost = {
  comment: (parent) => {
    stageCounts.set(parent, 0)
    return comment('') as unknown as Node
  },
  insert: (parent, node, before) =>
    insert(
      parent as unknown as SContainer,
      node as unknown as SNode,
      before as unknown as SNode | null,
    ),
  remove: (node) => remove(node as unknown as SNode),
  stage: (renderChild, target) =>
    prepareStage(
      renderChild,
      target as unknown as SContainer,
    ) as unknown as ReturnType<InternalHost['stage']>,
}

/** The server's staging: mount detached, commit by moving nodes into place. */
function prepareStage(
  renderChild: () => Child,
  target: SContainer,
): {
  owner: InternalOwner
  nodes: SNode[]
  commit: (before?: SNode | null) => void
  dispose: () => void
} {
  const owner = createInternalOwner('branch')
  const holder = fragment()
  const index = stageCounts.get(target) ?? 0
  stageCounts.set(target, index + 1)
  setInternalOwnerGate(owner, 1)
  let range: Range
  try {
    range = runWithOwner(owner, () =>
      mountValue(renderChild(), holder, null, owner),
    )
    runWithOwner(owner, () =>
      onCleanup(() => {
        for (const node of range.nodes) remove(node)
      }),
    )
  } catch (error) {
    disposeInternalOwner(owner)
    throw error
  }
  let committed = false
  let disposed = false
  return {
    owner,
    nodes: range.nodes,
    commit(before = null) {
      if (disposed) throw new Error('Staged branch is disposed')
      if (committed) return
      const open = comment(`b:${index}`)
      const close = comment('/b')
      const parent = before?.parent ?? target
      insert(parent, open, before)
      range.nodes = [open, ...moveChildren(holder, parent, before), close]
      insert(parent, close, before)
      committed = true
      setInternalOwnerGate(owner, 0)
    },
    dispose: () => {
      disposed = true
      disposeInternalOwner(owner)
    },
  }
}

function mountComponent(
  descriptor: ComponentDescriptor,
  parent: SContainer,
  before: SNode | null,
  parentOwner: InternalOwner,
): Range {
  const internalControl = internalControls?.get(descriptor.component)
  const fn = descriptor.component as unknown
  let componentRange: Range = { nodes: [], owner: parentOwner }
  const owner = runWithOwner(parentOwner, () =>
    createInternalOwner('component', () => false),
  )
  try {
    if (internalControl)
      componentRange = {
        nodes: runWithOwner(owner, () =>
          internalControl(
            descriptor.props,
            parent as unknown as Node,
            before as unknown as Node | null,
            owner,
            serverHost,
          ),
        ) as unknown as SNode[],
        owner,
      }
    else if (fn === Show)
      componentRange = mountShow(descriptor.props, parent, before, owner)
    else if (fn === For)
      componentRange = mountFor(descriptor.props, parent, before, owner)
    else if (fn === Switch)
      componentRange = mountSwitch(descriptor.props, parent, before, owner)
    else if (fn === Dynamic)
      componentRange = mountDynamic(descriptor.props, parent, before, owner)
    else if (fn === Portal)
      componentRange = mountPortal(descriptor.props, parent, before, owner)
    else if (fn === ErrorBoundary)
      componentRange = mountBoundary(descriptor.props, parent, before, owner)
    else if (fn === Match)
      throw new Error('<Match> must be nested inside <Switch>')
    else {
      let output!: Child
      runWithOwner(owner, () => {
        output = untrack(() => descriptor.component(descriptor.props))
      })
      componentRange = runWithOwner(owner, () =>
        mountValue(output, parent, before, owner),
      )
    }
    runWithOwner(owner, () =>
      onCleanup(() => {
        for (const node of componentRange.nodes) remove(node)
      }),
    )
    return componentRange
  } catch (error) {
    try {
      disposeInternalOwner(owner)
    } catch (disposeError) {
      reportInternalError(disposeError)
    }
    throw error
  }
}

function mountShow(
  props: Props,
  parent: SContainer,
  before: SNode | null,
  owner: InternalOwner,
): Range {
  rejectDynamicContent(parent, 'children')
  const slot = createSlot(parent, before, owner)
  runWithOwner(owner, () => {
    const when = computed(() => props.when)
    const present = computed(() => {
      const value = when()
      return value !== null && value !== undefined && value !== false
    })
    createRenderEffect(() => {
      const child = present() ? props.children : props.fallback
      const value =
        typeof child === 'function'
          ? (child as (value: () => unknown) => Child)(when)
          : (child as Child)
      updateSlot(slot, value, owner, (branch, at) =>
        createChildMount(value, parent, at, branch),
      )
    })
  })
  return slot.range
}

interface ForEntry {
  owner: InternalOwner
  open: SComment
  close: SComment
  nodes: SNode[]
  item: unknown
  value?: ReturnType<typeof signal<unknown>>
  index?: ReturnType<typeof signal<number>>
}

/**
 * The server rebuilds every item when `each` changes; there is no DOM
 * identity to preserve. Each item gets its own marker pair for hydration.
 */
function mountFor(
  props: Props,
  parent: SContainer,
  before: SNode | null,
  owner: InternalOwner,
): Range {
  rejectDynamicContent(parent, 'children')
  const slot = createSlot(parent, before, owner)
  let entries: ForEntry[] = []
  const clear = (): void => {
    for (const entry of entries) {
      disposeInternalOwner(entry.owner)
      remove(entry.open)
      remove(entry.close)
      for (const node of entry.nodes) remove(node)
    }
    entries = []
  }
  runWithOwner(owner, () => {
    onCleanup(clear)
    createRenderEffect(() => {
      const source = props.each
      const items = Array.isArray(source) ? source : []
      const by =
        typeof props.by === 'function'
          ? (props.by as (value: unknown) => unknown)
          : null
      clear()
      if (items.length === 0) {
        const value = props.fallback as Child
        updateSlot(slot, value, owner, (branch, at) =>
          createChildMount(value, parent, at, branch),
        )
        return
      }
      disposeMounted(slot.current)
      slot.current = null
      slot.initialized = false
      const seen = new Set<unknown>()
      items.forEach((item, position) => {
        const key = by ? by(item) : item
        const keyed =
          (typeof key === 'string' || typeof key === 'number') && !seen.has(key)
        seen.add(key)
        const itemOwner = runWithOwner(owner, () =>
          createInternalOwner(
            'branch',
            () => false,
            keyed
              ? `k${encodeURIComponent(key as string | number)}`
              : undefined,
          ),
        )
        const entry: ForEntry = {
          owner: itemOwner,
          open: comment('i'),
          close: comment('/i'),
          nodes: [],
          item,
        }
        insert(parent, entry.open, slot.marker)
        insert(parent, entry.close, slot.marker)
        let child!: Child
        runWithOwner(itemOwner, () => {
          child =
            typeof props.children === 'function'
              ? (
                  props.children as (
                    item: () => unknown,
                    index: () => number,
                  ) => Child
                )(
                  () =>
                    by ? (entry.value ??= signal(entry.item))() : entry.item,
                  () => (entry.index ??= signal(position))(),
                )
              : (props.children as Child)
        })
        entry.nodes = mountValue(child, parent, entry.close, itemOwner).nodes
        entries.push(entry)
      })
      slot.range.nodes = [
        ...(slot.open ? [slot.open] : []),
        ...entries.flatMap((entry) => [
          entry.open,
          ...entry.nodes,
          entry.close,
        ]),
        slot.marker,
      ]
    })
  })
  return slot.range
}

function isMatchDescriptor(value: Child): value is ComponentDescriptor {
  return (
    typeof value === 'object' &&
    value !== null &&
    !Array.isArray(value) &&
    (value as ComponentDescriptor).kind === 'component' &&
    ((value as ComponentDescriptor).component as unknown) === Match
  )
}

function mountSwitch(
  props: Props,
  parent: SContainer,
  before: SNode | null,
  owner: InternalOwner,
): Range {
  rejectDynamicContent(parent, 'children')
  const slot = createSlot(parent, before, owner)
  const children = props.children as Child
  const matches = (
    Array.isArray(children) ? (children.flat(Infinity) as Child[]) : [children]
  ).filter(isMatchDescriptor)
  runWithOwner(owner, () =>
    createRenderEffect(() => {
      let selected: ComponentDescriptor | undefined
      for (const match of matches) {
        const when = match.props.when
        if (when !== null && when !== undefined && when !== false) {
          selected = match
          break
        }
      }
      const child = selected ? selected.props.children : props.fallback
      const value =
        typeof child === 'function'
          ? (child as () => Child)()
          : (child as Child)
      updateSlot(slot, value, owner, (branch, at) =>
        createChildMount(value, parent, at, branch),
      )
    }),
  )
  return slot.range
}

function mountDynamic(
  props: Props,
  parent: SContainer,
  before: SNode | null,
  owner: InternalOwner,
): Range {
  rejectDynamicContent(parent, 'children')
  const slot = createSlot(parent, before, owner)
  let current: unknown
  runWithOwner(owner, () =>
    createRenderEffect(() => {
      const component = props.component
      if (Object.is(component, current)) return
      current = component
      const nextProps: Props = Object.create(
        Object.getPrototypeOf(props) as object | null,
      ) as Props
      Object.defineProperties(
        nextProps,
        Object.getOwnPropertyDescriptors(props),
      )
      delete nextProps.component
      const value =
        typeof component === 'string'
          ? jsx(component, nextProps)
          : component
            ? ({
                kind: 'component',
                component: component as Component,
                props: nextProps,
              } as unknown as Child)
            : null
      updateSlot(slot, value, owner, (branch, at) =>
        createChildMount(value, parent, at, branch),
      )
    }),
  )
  return slot.range
}

/** A portal's target is outside the root: the server emits only the pair. */
function mountPortal(
  props: Props,
  parent: SContainer,
  before: SNode | null,
  owner: InternalOwner,
): Range {
  void props
  const slot = createSlot(parent, before, owner)
  return slot.range
}

function mountBoundary(
  props: Props,
  parent: SContainer,
  before: SNode | null,
  owner: InternalOwner,
): Range {
  rejectDynamicContent(parent, 'children')
  const slot = createSlot(parent, before, owner)
  let reset = (): void => undefined
  let inFallback = false
  const renderContent = (value: Child): void =>
    updateSlot(slot, value, owner, (branch, at) =>
      createChildMount(value, parent, at, branch),
    )
  const showFallback = (error: unknown): void => {
    if (inFallback) throw error
    inFallback = true
    reset = () => {
      inFallback = false
      renderContent(props.children as Child)
    }
    const fallback = props.fallback
    renderContent(
      typeof fallback === 'function'
        ? (fallback as (error: unknown, retry: () => void) => Child)(
            error,
            reset,
          )
        : (fallback as Child),
    )
  }
  setInternalErrorHandler(owner, (error) => {
    if (inFallback) throw error
    showFallback(error)
  })
  try {
    renderContent(props.children as Child)
  } catch (error) {
    showFallback(error)
  }
  return slot.range
}

function mountTemplate(
  descriptor: TemplateDescriptor,
  parent: SContainer,
  before: SNode | null,
  owner: InternalOwner,
): Range {
  const slots: SNode[] = []
  const holder = fragment()
  const create = (instruction: Instruction, target: SContainer): void => {
    let node: SNode
    if (instruction.op === 'text') {
      node = text(instruction.value ?? '')
      if (instruction.slot !== undefined) {
        // A dynamic text slot: markers keep it a separate text node after
        // parsing, except inside RCDATA, where the element has one text node.
        const rcdata = target.kind === 1 && rcdataElements.has(target.tag)
        rejectDynamicContent(target, 'text')
        if (!rcdata) insert(target, comment('b'), null)
        insert(target, node, null)
        if (!rcdata) insert(target, comment('/b'), null)
        slots[instruction.slot] = node
        return
      }
    } else if (instruction.op === 'anchor') {
      rejectDynamicContent(target, 'children')
      const rcdata = target.kind === 1 && rcdataElements.has(target.tag)
      if (rcdata)
        throw new Error(
          `<${target.tag}> cannot contain child slots on the server`,
        )
      insert(target, comment('b'), null)
      node = comment('/b')
    } else {
      const namespace = instruction.ns ?? parentNamespace(target)
      const created = element(instruction.tag ?? 'div', namespace)
      for (const [name, value] of instruction.attrs ?? [])
        applyOneProp(created, name, value)
      node = created
    }
    insert(target, node, null)
    if (instruction.slot !== undefined) slots[instruction.slot] = node
    if (node.kind === 1)
      for (const child of instruction.children ?? []) create(child, node)
  }
  for (const instruction of descriptor.plan.nodes) create(instruction, holder)
  const nodes = moveChildren(holder, before?.parent ?? parent, before)
  const range: Range = { nodes, owner }
  runWithOwner(owner, () => {
    onCleanup(() => {
      for (const node of range.nodes) remove(node)
    })
    descriptor.setup({
      attr(slot, name, get) {
        const target = slots[slot]
        if (target?.kind === 1)
          createRenderEffect(() => applyOneProp(target, name, get()))
      },
      text(slot, get) {
        const node = slots[slot]
        if (node?.kind === 3)
          createRenderEffect(() => {
            node.data = String(get())
          })
      },
      child(slot, get) {
        const marker = slots[slot]
        if (marker?.kind !== 8 || !marker.parent) return
        const target: Slot = {
          parent: marker.parent,
          open: marker.prev?.kind === 8 ? marker.prev : null,
          marker,
          current: null,
          range: { nodes: [marker], owner },
          initialized: false,
          value: undefined,
          ordinal: claimInternalOrdinal(),
        }
        onCleanup(() => {
          disposeMounted(target.current)
          target.current = null
          if (target.open) remove(target.open)
          remove(target.marker)
          target.range.nodes = []
        })
        createRenderEffect(() => {
          const value = get()
          updateSlot(target, value, owner, (branch, at) =>
            createChildMount(value, target.parent, at, branch),
          )
        })
      },
      event() {
        // Events attach on the client only.
      },
    })
  })
  return range
}
