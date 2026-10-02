import {
  batch,
  computed,
  createRoot,
  onCleanup,
  signal,
  untrack,
} from '@benosjs/core'
import {
  createInternalOwner,
  createRenderEffect,
  disposeInternalOwner,
  getInternalProviderOwner,
  hasPendingMounts,
  notifyMount,
  reportInternalError,
  runWithOwner,
  setInternalErrorHandler,
} from '@benosjs/core/internal'
import type { InternalOwner } from '@benosjs/core/internal'
import type { ReadonlySignal } from '@benosjs/core'
import type {
  EventHandler as GeneratedEventHandler,
  GeneratedAttributes,
  GeneratedIntrinsicElements,
  Style as GeneratedStyle,
} from './generated-jsx.js'

export type Child =
  JSX.Element | string | number | boolean | null | undefined | readonly Child[]

type Props = Record<PropertyKey, unknown>
export type Component<P extends object = Props> = (props: Readonly<P>) => Child
type ControlKind =
  'show' | 'for' | 'switch' | 'match' | 'dynamic' | 'portal' | 'boundary'

interface ElementDescriptor {
  readonly kind: 'element'
  readonly tag: string
  readonly props: Props
  readonly namespace: 'html' | 'svg' | 'mathml'
}

interface ComponentDescriptor {
  readonly kind: 'component'
  readonly component: Component
  readonly props: Props
}

interface TemplateDescriptor {
  readonly kind: 'template'
  readonly plan: TemplatePlan
  readonly setup: (scope: TemplateScope) => void
}

type Descriptor = ElementDescriptor | ComponentDescriptor | TemplateDescriptor

const fragment = Symbol('benos.fragment')
export const Fragment = fragment
const controlKinds = new WeakMap<object, ControlKind>()
const development =
  (
    globalThis as typeof globalThis & {
      process?: { env?: { NODE_ENV?: string } }
    }
  ).process?.env?.NODE_ENV !== 'production'
const childrenDiagnostics = process.env.NODE_ENV !== 'production'

interface ChildrenMountState {
  active: number
  warned: boolean
}

let childrenMountStates: WeakMap<object, ChildrenMountState> | undefined

function markChildrenValue(value: Child): void {
  if (
    !childrenDiagnostics ||
    ((typeof value !== 'object' || value === null) &&
      typeof value !== 'function')
  )
    return
  ;(childrenMountStates ??= new WeakMap()).set(value as object, {
    active: 0,
    warned: false,
  })
}

function claimChildrenValue(value: Child, owner: InternalOwner): void {
  if (!childrenDiagnostics || !childrenMountStates) return
  if (
    (typeof value !== 'object' || value === null) &&
    typeof value !== 'function'
  )
    return
  const state = childrenMountStates.get(value as object)
  if (!state) return
  if (state.active > 0 && !state.warned) {
    state.warned = true
    console.warn(
      'A children() value was mounted more than once; create a fresh child descriptor for each location.',
    )
  }
  state.active++
  runWithOwner(owner, () =>
    onCleanup(() => {
      state.active--
      if (state.active === 0) state.warned = false
    }),
  )
}

function markControl<T extends object>(fn: T, kind: ControlKind): T {
  controlKinds.set(fn, kind)
  return fn
}

function copyProps(value: unknown): Props {
  const source = value && typeof value === 'object' ? value : {}
  const result = Object.create(Object.getPrototypeOf(source)) as Props
  Object.defineProperties(result, Object.getOwnPropertyDescriptors(source))
  return result
}

function isComponent(value: unknown): value is Component {
  return typeof value === 'function'
}

export function jsx(
  type: string | typeof Fragment | Component,
  props: unknown,
  key?: unknown,
): JSX.Element {
  const next = copyProps(props)
  if (key !== undefined)
    Object.defineProperty(next, 'key', {
      configurable: true,
      enumerable: false,
      value: key,
    })
  if (type === fragment)
    return { kind: 'component', component: FragmentComponent, props: next }
  if (typeof type === 'string')
    return {
      kind: 'element',
      tag: type,
      props: next,
      namespace: namespaceFor(type, 'html'),
    }
  if (!isComponent(type)) throw new Error('Invalid Benos JSX element type')
  return { kind: 'component', component: type, props: next }
}

export function jsxs(
  type: string | typeof Fragment | Component,
  props: unknown,
  key?: unknown,
): JSX.Element {
  return jsx(type, props, key)
}

export function jsxDEV(
  type: string | typeof Fragment | Component,
  props: unknown,
  key?: unknown,
  _isStaticChildren?: boolean,
  _source?: unknown,
  _self?: unknown,
): JSX.Element {
  void _isStaticChildren
  void _source
  void _self
  return jsx(type, props, key)
}

function FragmentComponent(props: Props): Child {
  return props.children as Child
}

function namespaceFor(
  tag: string,
  parent: 'html' | 'svg' | 'mathml',
): 'html' | 'svg' | 'mathml' {
  if (tag === 'svg') return 'svg'
  if (tag === 'math') return 'mathml'
  if (parent === 'svg') return 'svg'
  if (parent === 'mathml') return 'mathml'
  return 'html'
}

interface DomRange {
  nodes: Node[]
  owner: InternalOwner
}

interface Mounted {
  range: DomRange
  owner: InternalOwner
}

interface Slot {
  parent: Node
  marker: Comment
  after: Node | null
  current: Mounted | null
  range: DomRange
  initialized: boolean
  value: Child
}

type Key = string | symbol

function ownerDocumentOf(node: Node): Document {
  if (node instanceof Document) return node
  const document = node.ownerDocument
  if (!document) throw new Error('Benos DOM node has no owner document')
  return document
}

function insert(parent: Node, node: Node, before: Node | null): void {
  parent.insertBefore(node, before)
}

function rangeConnected(range: DomRange): boolean {
  return range.nodes.length > 0 && range.nodes.every((node) => node.isConnected)
}

function removeRange(range: DomRange): void {
  for (const node of range.nodes) node.parentNode?.removeChild(node)
}

function moveRange(range: DomRange, parent: Node, before: Node | null): void {
  for (const node of range.nodes) parent.insertBefore(node, before)
}

function disposeMounted(mounted: Mounted | null): void {
  if (!mounted) return
  disposeInternalOwner(mounted.owner)
  removeRange(mounted.range)
}

function setSlotRange(slot: Slot): void {
  const nodes = slot.current?.range.nodes ?? []
  slot.range.nodes = slot.marker.parentNode ? [...nodes, slot.marker] : nodes
}

function ensureSlotMarker(slot: Slot): void {
  if (slot.marker.parentNode) return
  const before = slot.after?.parentNode === slot.parent ? slot.after : null
  insert(slot.parent, slot.marker, before)
}

function updateSlot(
  slot: Slot,
  value: Child,
  owner: InternalOwner,
  createBranch: (owner: InternalOwner, before: Node | null) => Mounted,
): void {
  const currentNode = slot.current?.range.nodes[0]
  if (
    currentNode instanceof Text &&
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
  ensureSlotMarker(slot)
  const branch = runWithOwner(owner, () =>
    createInternalOwner('branch', () =>
      slot.current ? rangeConnected(slot.current.range) : false,
    ),
  )
  try {
    slot.current = createBranch(branch, slot.marker)
    slot.value = value
    slot.initialized = true
    if (
      slot.current.range.nodes.length === 1 &&
      slot.current.range.nodes[0]?.nodeType === Node.ELEMENT_NODE
    )
      slot.marker.parentNode?.removeChild(slot.marker)
    setSlotRange(slot)
    if (rangeConnected(slot.current.range)) notifyMount(branch)
    else trackMount(branch, slot.current.range)
  } catch (error) {
    disposeInternalOwner(branch)
    throw error
  }
}

function createSlot(
  parent: Node,
  before: Node | null,
  owner: InternalOwner,
): Slot {
  const marker = ownerDocumentOf(parent).createComment('')
  insert(parent, marker, before)
  const slot: Slot = {
    parent,
    marker,
    after: marker.nextSibling,
    current: null,
    range: { nodes: [marker], owner },
    initialized: false,
    value: undefined,
  }
  runWithOwner(owner, () =>
    onCleanup(() => {
      disposeMounted(slot.current)
      slot.current = null
      slot.marker.parentNode?.removeChild(slot.marker)
      slot.range.nodes = []
    }),
  )
  return slot
}

function mountValue(
  value: Child,
  parent: Node,
  before: Node | null,
  owner: InternalOwner,
  providerHandled = false,
): DomRange {
  const providerOwner = providerHandled ? null : getInternalProviderOwner(value)
  if (providerOwner)
    return mountValue(value as Child, parent, before, providerOwner, true)
  if (childrenDiagnostics) claimChildrenValue(value, owner)
  if (Array.isArray(value)) {
    const values = value.flat(Infinity) as Child[]
    if (values.length === 1) return mountValue(values[0], parent, before, owner)
    const nodes: Node[] = []
    for (const item of values)
      nodes.push(...mountValue(item, parent, before, owner).nodes)
    if (nodes.length > 0) return { nodes, owner }
    const empty = ownerDocumentOf(parent).createComment('')
    insert(parent, empty, before)
    return { nodes: [empty], owner }
  }
  if (value === null || value === undefined || typeof value === 'boolean') {
    const empty = ownerDocumentOf(parent).createComment('')
    insert(parent, empty, before)
    return { nodes: [empty], owner }
  }
  if (typeof value === 'string' || typeof value === 'number') {
    const text = ownerDocumentOf(parent).createTextNode(String(value))
    insert(parent, text, before)
    return { nodes: [text], owner }
  }
  if (typeof value !== 'object')
    throw new Error('Unsupported Benos child value')
  const descriptor = value as Descriptor
  if (descriptor.kind === 'element')
    return mountElement(descriptor, parent, before, owner)
  if (descriptor.kind === 'component')
    return mountComponent(descriptor, parent, before, owner)
  return mountTemplate(descriptor, parent, before, owner)
}

function mountElement(
  descriptor: ElementDescriptor,
  parent: Node,
  before: Node | null,
  owner: InternalOwner,
): DomRange {
  const document = ownerDocumentOf(parent)
  const parentNamespace =
    parent.nodeType === Node.ELEMENT_NODE
      ? (parent as Element).localName === 'foreignObject'
        ? 'html'
        : (parent as Element).namespaceURI === 'http://www.w3.org/2000/svg'
          ? 'svg'
          : (parent as Element).namespaceURI ===
              'http://www.w3.org/1998/Math/MathML'
            ? 'mathml'
            : 'html'
      : 'html'
  const namespace = namespaceFor(descriptor.tag, parentNamespace)
  const element =
    namespace === 'html'
      ? document.createElement(descriptor.tag)
      : document.createElementNS(
          namespace === 'svg'
            ? 'http://www.w3.org/2000/svg'
            : 'http://www.w3.org/1998/Math/MathML',
          descriptor.tag,
        )
  insert(parent, element, before)
  const range: DomRange = { nodes: [element], owner }
  runWithOwner(owner, () => {
    onCleanup(() => removeRange(range))
    applyProps(element, descriptor.props, owner, namespace)
  })
  return range
}

function readProp(props: Props, key: PropertyKey): unknown {
  return untrack(() => props[key])
}

function isGetter(props: Props, key: PropertyKey): boolean {
  return Boolean(Object.getOwnPropertyDescriptor(props, key)?.get)
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
const propertyNames = new Set(['value', 'checked', 'selected', 'selectedIndex'])
const delegatedEvents = new Set([
  'click',
  'input',
  'change',
  'keydown',
  'keyup',
  'pointerdown',
  'pointerup',
  'submit',
  'focusin',
  'focusout',
  'dblclick',
])

interface EventRecord {
  element: Element
  name: string
  getHandler: () => unknown
}
interface EventHub {
  root: Document | ShadowRoot
  byType: Map<string, Map<Element, Set<EventRecord>>>
  listeners: Map<string, EventListener>
}
const hubs = new WeakMap<Document | ShadowRoot, EventHub>()

function eventName(
  key: PropertyKey,
): { name: string; capture: boolean } | null {
  if (typeof key !== 'string') return null
  if (key.startsWith('on:'))
    return { name: key.slice(3).toLowerCase(), capture: false }
  if (!key.startsWith('on') || key.length < 3) return null
  const capture = key.endsWith('Capture')
  const base = capture ? key.slice(2, -7) : key.slice(2)
  return base ? { name: base.toLowerCase(), capture } : null
}

function rootFor(element: Element): Document | ShadowRoot {
  const root = element.getRootNode()
  if (root instanceof ShadowRoot) return root
  if (!element.ownerDocument)
    throw new Error('Benos element has no owner document')
  return element.ownerDocument
}

function invokeHandler(record: EventRecord, event: Event): void {
  const handler = untrack(record.getHandler)
  if (typeof handler !== 'function') return
  try {
    const result = batch(() =>
      (handler as (event: Event) => unknown).call(record.element, event),
    )
    if (result && typeof (result as Promise<unknown>).then === 'function')
      void (result as Promise<unknown>).catch(reportInternalError)
  } catch (error) {
    reportInternalError(error)
  }
}

function getHub(root: Document | ShadowRoot): EventHub {
  const existing = hubs.get(root)
  if (existing) return existing
  const hub: EventHub = { root, byType: new Map(), listeners: new Map() }
  hubs.set(root, hub)
  return hub
}

function installDelegated(record: EventRecord): () => void {
  const root = rootFor(record.element)
  const hub = getHub(root)
  let byElement = hub.byType.get(record.name)
  if (!byElement) {
    byElement = new Map()
    hub.byType.set(record.name, byElement)
  }
  let records = byElement.get(record.element)
  if (!records) {
    records = new Set()
    byElement.set(record.element, records)
  }
  records.add(record)
  if (!hub.listeners.has(record.name)) {
    const listener: EventListener = (event) => {
      for (const item of event.composedPath()) {
        if (item === root) break
        if (!(item instanceof Element)) continue
        const group = hub.byType.get(record.name)?.get(item)
        if (group) {
          for (const handler of [...group]) {
            if (event.cancelBubble && item !== event.target) return
            const previous = Object.getOwnPropertyDescriptor(
              event,
              'currentTarget',
            )
            try {
              Object.defineProperty(event, 'currentTarget', {
                configurable: true,
                value: item,
              })
            } catch {
              continue
            }
            invokeHandler(handler, event)
            if (previous)
              Object.defineProperty(event, 'currentTarget', previous)
            else
              delete (event as unknown as { currentTarget?: unknown })
                .currentTarget
            if (event.cancelBubble) return
          }
        }
      }
    }
    hub.listeners.set(record.name, listener)
    root.addEventListener(record.name, listener)
  }
  return () => {
    const records = byElement?.get(record.element)
    records?.delete(record)
    if (records?.size === 0) byElement?.delete(record.element)
    if (byElement?.size === 0) hub.byType.delete(record.name)
    if (!hub.byType.has(record.name)) {
      const listener = hub.listeners.get(record.name)
      if (listener) root.removeEventListener(record.name, listener)
      hub.listeners.delete(record.name)
    }
  }
}

function installEvent(
  element: Element,
  key: PropertyKey,
  props: Props,
  owner: InternalOwner,
): void {
  const parsed = eventName(key)
  if (!parsed) return
  const record: EventRecord = {
    element,
    name: parsed.name,
    getHandler: () => props[key],
  }
  if (delegatedEvents.has(record.name) && !parsed.capture) {
    const remove = installDelegated(record)
    runWithOwner(owner, () => onCleanup(remove))
    return
  }
  const listener: EventListener = (event) => invokeHandler(record, event)
  element.addEventListener(record.name, listener, parsed.capture)
  runWithOwner(owner, () =>
    onCleanup(() =>
      element.removeEventListener(record.name, listener, parsed.capture),
    ),
  )
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

function setAttributeValue(
  element: Element,
  name: string,
  value: unknown,
  namespace: 'html' | 'svg' | 'mathml',
): void {
  const lower = name.toLowerCase()
  if (booleanAttributes.has(lower)) {
    if (value) element.setAttribute(name, '')
    else element.removeAttribute(name)
    return
  }
  if (value === null || value === undefined) {
    element.removeAttribute(name)
    return
  }
  if (name === 'style' && typeof value === 'object') {
    const style =
      'style' in element ? (element as HTMLElement | SVGElement).style : null
    if (style) {
      for (const key of Reflect.ownKeys(value)) {
        if (typeof key !== 'string') continue
        const next = (value as Record<string, unknown>)[key]
        if (next === null || next === undefined) style.removeProperty(key)
        else style.setProperty(key, String(next))
      }
    }
    return
  }
  if (
    ['href', 'src', 'action', 'formaction', 'poster', 'xlink:href'].includes(
      lower,
    ) &&
    typeof value === 'string' &&
    isDangerousUrl(value)
  ) {
    element.removeAttribute(name)
    return
  }
  if (
    ['href', 'src', 'action', 'formaction', 'poster', 'xlink:href'].includes(
      lower,
    ) &&
    typeof value === 'string' &&
    value.trim().toLowerCase().startsWith('data:')
  ) {
    const imageData =
      lower === 'src' &&
      element.localName === 'img' &&
      /^data:image\//i.test(value.trim())
    if (!imageData) {
      element.removeAttribute(name)
      return
    }
  }
  if (namespace === 'svg' && name === 'xlink:href') {
    element.setAttributeNS('http://www.w3.org/1999/xlink', name, String(value))
    return
  }
  element.setAttribute(name, String(value))
}

function applyOneProp(
  element: Element,
  key: PropertyKey,
  value: unknown,
  namespace: 'html' | 'svg' | 'mathml',
): void {
  if (typeof key !== 'string') return
  if (propertyNames.has(key) && key in element)
    (element as unknown as Record<string, unknown>)[key] = value ?? ''
  else setAttributeValue(element, key, value, namespace)
}

function applyProps(
  element: Element,
  props: Props,
  owner: InternalOwner,
  namespace: 'html' | 'svg' | 'mathml',
): void {
  const keys =
    Object.getPrototypeOf(props) === Object.prototype
      ? Object.keys(props)
      : Reflect.ownKeys(props)
  for (const key of keys) {
    if (key === 'children' || key === 'key') continue
    if (key === 'ref') {
      const ref = readProp(props, key)
      if (typeof ref === 'function') runWithOwner(owner, () => ref(element))
      continue
    }
    if (eventName(key)) {
      installEvent(element, key, props, owner)
      continue
    }
    const update = () => applyOneProp(element, key, props[key], namespace)
    if (isGetter(props, key))
      runWithOwner(owner, () => createRenderEffect(update))
    else update()
  }
  if (Object.prototype.hasOwnProperty.call(props, 'children')) {
    if (!isGetter(props, 'children')) {
      const range = mountValue(
        readProp(props, 'children') as Child,
        element,
        null,
        owner,
      )
      runWithOwner(owner, () => onCleanup(() => removeRange(range)))
      return
    }
    const slot = createSlot(element, null, owner)
    runWithOwner(owner, () =>
      createRenderEffect(() => {
        const value = props.children as Child
        updateSlot(slot, value, owner, (branch, at) => ({
          range: mountValue(value, element, at, branch),
          owner: branch,
        }))
      }),
    )
  }
}

interface ComponentInstance {
  owner: InternalOwner
  range: DomRange
}
interface ObserverRecord {
  observer: MutationObserver
  pending: Set<ComponentInstance>
}
const observers = new WeakMap<Document, ObserverRecord>()

function trackMount(owner: InternalOwner, range: DomRange): void {
  if (!hasPendingMounts(owner)) return
  if (rangeConnected(range)) {
    notifyMount(owner)
    return
  }
  const document = range.nodes[0] ? ownerDocumentOf(range.nodes[0]) : null
  if (!document) return
  let record = observers.get(document)
  if (!record) {
    const pending = new Set<ComponentInstance>()
    const observer = new MutationObserver(() => {
      for (const instance of [...pending]) {
        if (
          !hasPendingMounts(instance.owner) ||
          instance.range.nodes.length === 0
        ) {
          pending.delete(instance)
          continue
        }
        if (rangeConnected(instance.range)) {
          notifyMount(instance.owner)
          if (!hasPendingMounts(instance.owner)) pending.delete(instance)
        }
      }
      if (pending.size === 0) {
        observer.disconnect()
        observers.delete(document)
      }
    })
    record = { observer, pending }
    observers.set(document, record)
    observer.observe(document, { childList: true, subtree: true })
  }
  const instance = { owner, range }
  record.pending.add(instance)
  runWithOwner(owner, () =>
    onCleanup(() => {
      record?.pending.delete(instance)
      if (record?.pending.size === 0) {
        record.observer.disconnect()
        observers.delete(document)
      }
    }),
  )
}

function mountComponent(
  descriptor: ComponentDescriptor,
  parent: Node,
  before: Node | null,
  parentOwner: InternalOwner,
): DomRange {
  const kind = controlKinds.get(descriptor.component)
  let componentRange: DomRange = { nodes: [], owner: parentOwner }
  const owner = runWithOwner(parentOwner, () =>
    createInternalOwner('component', () => rangeConnected(componentRange)),
  )
  try {
    if (kind)
      componentRange = mountControl(
        kind,
        descriptor.props,
        parent,
        before,
        owner,
      )
    else {
      let output!: Child
      runWithOwner(owner, () => {
        output = descriptor.component(descriptor.props) as Child
      })
      componentRange = runWithOwner(owner, () =>
        mountValue(output, parent, before, owner),
      )
    }
    runWithOwner(owner, () => onCleanup(() => removeRange(componentRange)))
    if (rangeConnected(componentRange)) notifyMount(owner)
    else trackMount(owner, componentRange)
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

function createChildMount(
  value: Child,
  parent: Node,
  before: Node | null,
  owner: InternalOwner,
): Mounted {
  return { range: mountValue(value, parent, before, owner), owner }
}

function mountShow(
  props: Props,
  parent: Node,
  before: Node | null,
  owner: InternalOwner,
): DomRange {
  const slot = createSlot(parent, before, owner)
  runWithOwner(owner, () =>
    createRenderEffect(() => {
      const when = props.when
      const present = when !== null && when !== undefined && when !== false
      const child = present ? props.children : props.fallback
      const value =
        typeof child === 'function'
          ? (child as (value: () => unknown) => Child)(() => when)
          : (child as Child)
      updateSlot(slot, value, owner, (branch, at) =>
        createChildMount(value, parent, at, branch),
      )
    }),
  )
  return slot.range
}

interface ForEntry {
  key: unknown
  item: unknown
  position: number
  index?: ReturnType<typeof signal<number>>
  value?: ReturnType<typeof signal<unknown>>
  getItem: () => unknown
  getIndex: () => number
  owner: InternalOwner
  range: DomRange
}
const negZeroKey = Object.freeze({ key: '-0' })
const nanKey = Object.freeze({ key: 'NaN' })
function mapKey(value: unknown): unknown {
  if (typeof value === 'number') {
    if (Number.isNaN(value)) return nanKey
    if (Object.is(value, -0)) return negZeroKey
  }
  return value
}
function sameKey(a: unknown, b: unknown): boolean {
  return Object.is(a, b)
}

function lisIndices(values: number[]): Set<number> {
  const tails: number[] = []
  const previous = new Array<number>(values.length).fill(-1)
  for (let index = 0; index < values.length; index++) {
    const value = values[index] as number
    let low = 0
    let high = tails.length
    while (low < high) {
      const middle = (low + high) >> 1
      if ((values[tails[middle] as number] as number) < value) low = middle + 1
      else high = middle
    }
    previous[index] = low > 0 ? (tails[low - 1] as number) : -1
    tails[low] = index
  }
  const result = new Set<number>()
  let cursor = tails[tails.length - 1] ?? -1
  while (cursor >= 0) {
    result.add(cursor)
    cursor = previous[cursor] ?? -1
  }
  return result
}

function mountFor(
  props: Props,
  parent: Node,
  before: Node | null,
  owner: InternalOwner,
): DomRange {
  const slot = createSlot(parent, before, owner)
  let entries: ForEntry[] = []
  const renderFallback = () => {
    const value = props.fallback as Child
    updateSlot(slot, value, owner, (branch, at) =>
      createChildMount(value, parent, at, branch),
    )
  }
  const reconcile = () => {
    ensureSlotMarker(slot)
    const source = props.each
    const items = Array.isArray(source) ? source : []
    const by =
      typeof props.by === 'function'
        ? (props.by as (value: unknown) => unknown)
        : null
    const keys = items.map((item) => (by ? by(item) : item))
    const seenKeys = new Set<unknown>()
    const effectiveKeys = keys.map((key) => {
      const mapped = mapKey(key)
      if (seenKeys.has(mapped)) {
        if (development)
          console.warn(
            'Duplicate <For> key; treating the extra item as unkeyed.',
          )
        return Object.freeze({ duplicate: key })
      }
      seenKeys.add(mapped)
      return key
    })
    if (items.length === 0 && entries.length > 0) {
      const entryNodes = entries.flatMap((entry) => entry.range.nodes)
      const fillsParent =
        slot.marker.parentNode === parent &&
        parent.lastChild === slot.marker &&
        parent.childNodes.length === entryNodes.length + 1
      if (fillsParent) {
        for (const entry of entries) disposeInternalOwner(entry.owner)
        parent.textContent = ''
        entries = []
        slot.range.nodes = []
        renderFallback()
        return
      }
    }
    const createEntry = (
      key: unknown,
      item: unknown,
      index: number,
    ): ForEntry => {
      const itemOwner = runWithOwner(owner, () => createInternalOwner('branch'))
      const entry: ForEntry = {
        key,
        item,
        position: index,
        getItem: () =>
          by ? (entry.value ??= signal(entry.item))() : entry.item,
        getIndex: () => (entry.index ??= signal(entry.position))(),
        owner: itemOwner,
        range: { nodes: [], owner: itemOwner },
      }
      let child!: Child
      runWithOwner(itemOwner, () => {
        child =
          typeof props.children === 'function'
            ? (
                props.children as (
                  item: () => unknown,
                  index: () => number,
                ) => Child
              )(entry.getItem, entry.getIndex)
            : (props.children as Child)
      })
      entry.range = mountValue(child, parent, slot.marker, itemOwner)
      return entry
    }
    const commitEntries = (next: ForEntry[]): void => {
      entries = next
      disposeMounted(slot.current)
      slot.current = null
      if (entries.length === 0) renderFallback()
      else {
        const singleton =
          entries.length === 1 &&
          entries[0]?.range.nodes.length === 1 &&
          entries[0].range.nodes[0]?.nodeType === Node.ELEMENT_NODE
        if (singleton) {
          slot.marker.parentNode?.removeChild(slot.marker)
          slot.range.nodes = entries[0]?.range.nodes ?? []
        } else
          slot.range.nodes = [
            ...entries.flatMap((entry) => entry.range.nodes),
            slot.marker,
          ]
      }
    }
    if (items.length + 1 === entries.length) {
      let index = 0
      while (
        index < items.length &&
        sameKey(entries[index + 1]?.key, effectiveKeys[index])
      )
        index++
      if (index === items.length) {
        const removed = entries[0] as ForEntry
        const next = entries.slice()
        next.shift()
        disposeInternalOwner(removed.owner)
        removeRange(removed.range)
        for (let nextIndex = 0; nextIndex < next.length; nextIndex++) {
          const entry = next[nextIndex] as ForEntry
          entry.item = items[nextIndex]
          entry.position = nextIndex
          entry.value?.set(items[nextIndex])
          entry.index?.set(nextIndex)
        }
        commitEntries(next)
        return
      }
    }
    const oldByKey = new Map<unknown, ForEntry>()
    for (const entry of entries) {
      const mapped = mapKey(entry.key)
      if (!oldByKey.has(mapped)) oldByKey.set(mapped, entry)
    }
    const next: ForEntry[] = []
    const used = new Set<ForEntry>()
    for (let index = 0; index < items.length; index++) {
      const key = effectiveKeys[index]
      const previous = oldByKey.get(mapKey(key))
      if (previous && !used.has(previous) && sameKey(previous.key, key)) {
        used.add(previous)
        previous.item = items[index]
        previous.position = index
        previous.value?.set(items[index])
        previous.index?.set(index)
        next.push(previous)
        continue
      }
      next.push(createEntry(key, items[index], index))
    }
    for (const entry of entries)
      if (!used.has(entry) && !next.includes(entry)) {
        disposeInternalOwner(entry.owner)
        removeRange(entry.range)
      }
    const oldIndexByEntry = new Map<ForEntry, number>()
    entries.forEach((entry, index) => oldIndexByEntry.set(entry, index))
    let prefix = 0
    while (
      prefix < entries.length &&
      prefix < next.length &&
      entries[prefix] === next[prefix]
    )
      prefix++
    let suffix = 0
    while (
      suffix < entries.length - prefix &&
      suffix < next.length - prefix &&
      entries[entries.length - 1 - suffix] === next[next.length - 1 - suffix]
    )
      suffix++
    const middleIndices: number[] = []
    const middleIndexByOld = new Map<number, number>()
    for (let index = prefix; index < next.length - suffix; index++) {
      const oldIndex = oldIndexByEntry.get(next[index] as ForEntry)
      if (oldIndex !== undefined) {
        middleIndexByOld.set(oldIndex, middleIndices.length)
        middleIndices.push(oldIndex)
      }
    }
    const stable = lisIndices(middleIndices)
    for (let index = next.length - suffix - 1; index >= prefix; index--) {
      const entry = next[index] as ForEntry
      const at = next[index + 1]?.range.nodes[0] ?? slot.marker
      const oldIndex = oldIndexByEntry.get(entry)
      if (oldIndex === undefined) moveRange(entry.range, parent, at)
      else if (!stable.has(middleIndexByOld.get(oldIndex) ?? -1))
        moveRange(entry.range, parent, at)
    }
    commitEntries(next)
  }
  runWithOwner(owner, () => createRenderEffect(reconcile))
  return slot.range
}

function isMatchDescriptor(value: Child): value is ComponentDescriptor {
  return (
    typeof value === 'object' &&
    value !== null &&
    !Array.isArray(value) &&
    (value as Descriptor).kind === 'component' &&
    controlKinds.get((value as ComponentDescriptor).component) === 'match'
  )
}
function flattenChildren(value: Child): Child[] {
  return Array.isArray(value) ? (value.flat(Infinity) as Child[]) : [value]
}

function mountSwitch(
  props: Props,
  parent: Node,
  before: Node | null,
  owner: InternalOwner,
): DomRange {
  const slot = createSlot(parent, before, owner)
  const matches = flattenChildren(props.children as Child).filter(
    isMatchDescriptor,
  )
  runWithOwner(owner, () =>
    createRenderEffect(() => {
      let selected: ComponentDescriptor | undefined
      for (const match of matches) {
        if (
          match.props.when !== null &&
          match.props.when !== undefined &&
          match.props.when !== false
        ) {
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
  parent: Node,
  before: Node | null,
  owner: InternalOwner,
): DomRange {
  const slot = createSlot(parent, before, owner)
  let current: unknown
  runWithOwner(owner, () =>
    createRenderEffect(() => {
      const component = props.component
      if (Object.is(component, current)) return
      current = component
      const nextProps = copyProps(props)
      delete nextProps.component
      const value =
        typeof component === 'string'
          ? jsx(component, nextProps)
          : component
            ? ({
                kind: 'component',
                component: component as Component,
                props: nextProps,
              } as ComponentDescriptor)
            : null
      updateSlot(slot, value, owner, (branch, at) =>
        createChildMount(value, parent, at, branch),
      )
    }),
  )
  return slot.range
}

function mountPortal(
  props: Props,
  parent: Node,
  before: Node | null,
  owner: InternalOwner,
): DomRange {
  const placeholder = createSlot(parent, before, owner)
  let target: Node | null = null
  let currentChild: Child = undefined
  runWithOwner(owner, () =>
    createRenderEffect(() => {
      const nextTarget = props.mount as Node | null
      if (!nextTarget) return
      const nextChild = props.children as Child
      if (!placeholder.current) {
        placeholder.marker.parentNode?.removeChild(placeholder.marker)
        placeholder.parent = nextTarget
        placeholder.marker = ownerDocumentOf(nextTarget).createComment('')
        insert(nextTarget, placeholder.marker, null)
        placeholder.range.nodes = [placeholder.marker]
        updateSlot(placeholder, nextChild, owner, (branch, at) =>
          createChildMount(nextChild, nextTarget, at, branch),
        )
        currentChild = nextChild
        target = nextTarget
      } else if (target !== nextTarget) {
        moveRange(placeholder.current.range, nextTarget, null)
        if (placeholder.marker.parentNode)
          nextTarget.appendChild(placeholder.marker)
        target = nextTarget
        placeholder.parent = nextTarget
        if (rangeConnected(placeholder.current.range))
          notifyMount(placeholder.current.owner)
      }
      if (placeholder.current && !Object.is(currentChild, nextChild)) {
        updateSlot(placeholder, nextChild, owner, (branch, at) =>
          createChildMount(nextChild, nextTarget, at, branch),
        )
        currentChild = nextChild
      }
    }),
  )
  return placeholder.range
}

function mountBoundary(
  props: Props,
  parent: Node,
  before: Node | null,
  owner: InternalOwner,
): DomRange {
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
  let previousResetKeys: readonly unknown[] | null = null
  runWithOwner(owner, () =>
    createRenderEffect(() => {
      const nextKeys = props.resetKeys
      if (!Array.isArray(nextKeys)) return
      const changed =
        previousResetKeys === null ||
        previousResetKeys.length !== nextKeys.length ||
        nextKeys.some(
          (key, index) => !Object.is(key, previousResetKeys?.[index]),
        )
      previousResetKeys = nextKeys
      if (changed && inFallback) reset()
    }),
  )
  try {
    renderContent(props.children as Child)
  } catch (error) {
    showFallback(error)
  }
  return slot.range
}

function mountControl(
  kind: ControlKind,
  props: Props,
  parent: Node,
  before: Node | null,
  owner: InternalOwner,
): DomRange {
  if (kind === 'show') return mountShow(props, parent, before, owner)
  if (kind === 'for') return mountFor(props, parent, before, owner)
  if (kind === 'switch') return mountSwitch(props, parent, before, owner)
  if (kind === 'dynamic') return mountDynamic(props, parent, before, owner)
  if (kind === 'portal') return mountPortal(props, parent, before, owner)
  if (kind === 'boundary') return mountBoundary(props, parent, before, owner)
  throw new Error('<Match> must be nested inside <Switch>')
}

interface TemplatePrototype {
  fragment: DocumentFragment
  slots: Map<number, number[]>
}

const templatePrototypes = new WeakMap<
  Document,
  Map<string, TemplatePrototype>
>()

function nodeAtPath(root: Node, path: readonly number[]): Node {
  let node = root
  for (const index of path) {
    const child = node.childNodes.item(index)
    if (!child) throw new Error('Invalid Benos template slot path')
    node = child
  }
  return node
}

function templatePrototype(
  document: Document,
  plan: TemplatePlan,
): TemplatePrototype {
  let byId = templatePrototypes.get(document)
  if (!byId) {
    byId = new Map()
    templatePrototypes.set(document, byId)
  }
  const cached = byId.get(plan.id)
  if (cached) return cached
  const fragment = document.createDocumentFragment()
  // Slot paths are computed once while this document's prototype is built.
  const slots = new Map<number, number[]>()
  const create = (
    instruction: StaticInstruction,
    parent: Node,
    parentPath: readonly number[],
  ): void => {
    const index = parent.childNodes.length
    const path = [...parentPath, index]
    let node: Node
    if (instruction.op === 'text')
      node = document.createTextNode(instruction.value ?? '')
    else if (instruction.op === 'anchor') node = document.createComment('')
    else {
      const namespace = instruction.ns ?? 'html'
      node =
        namespace === 'html'
          ? document.createElement(instruction.tag ?? 'div')
          : document.createElementNS(
              namespace === 'svg'
                ? 'http://www.w3.org/2000/svg'
                : 'http://www.w3.org/1998/Math/MathML',
              instruction.tag ?? 'div',
            )
      for (const [name, value] of instruction.attrs ?? [])
        setAttributeValue(node as Element, name, value, namespace)
    }
    parent.appendChild(node)
    if (instruction.slot !== undefined) slots.set(instruction.slot, path)
    for (const child of instruction.children ?? []) create(child, node, path)
  }
  for (const instruction of plan.nodes) create(instruction, fragment, [])
  const prototype = { fragment, slots }
  byId.set(plan.id, prototype)
  return prototype
}

function mountTemplate(
  descriptor: TemplateDescriptor,
  parent: Node,
  before: Node | null,
  owner: InternalOwner,
): DomRange {
  const document = ownerDocumentOf(parent)
  const prototype = templatePrototype(document, descriptor.plan)
  const fragment = prototype.fragment.cloneNode(true) as DocumentFragment
  const nodes = Array.from(fragment.childNodes)
  const slots = new Map<number, Node>()
  for (const [slot, path] of prototype.slots)
    slots.set(slot, nodeAtPath(fragment, path))
  insert(parent, fragment, before)
  const range: DomRange = { nodes, owner }
  runWithOwner(owner, () => {
    onCleanup(() => removeRange(range))
    descriptor.setup({
      attr(slot, name, get) {
        const element = slots.get(slot)
        if (element instanceof Element)
          createRenderEffect(() => applyOneProp(element, name, get(), 'html'))
      },
      text(slot, get) {
        const node = slots.get(slot)
        if (node instanceof Text)
          createRenderEffect(() => {
            node.data = String(get())
          })
      },
      child(slot, get) {
        const marker = slots.get(slot)
        if (!(marker instanceof Comment) || !marker.parentNode) return
        const target: Slot = {
          parent: marker.parentNode,
          marker,
          after: marker.nextSibling,
          current: null,
          range: { nodes: [marker], owner },
          initialized: false,
          value: undefined,
        }
        runWithOwner(owner, () =>
          onCleanup(() => {
            disposeMounted(target.current)
            target.current = null
            target.marker.parentNode?.removeChild(target.marker)
            target.range.nodes = []
          }),
        )
        runWithOwner(owner, () =>
          createRenderEffect(() => {
            const value = get()
            updateSlot(target, value, owner, (branch, at) =>
              createChildMount(value, target.parent, at, branch),
            )
          }),
        )
      },
      event(slot, name, get) {
        const element = slots.get(slot)
        if (element instanceof Element) {
          const props = Object.create(null) as Props
          Object.defineProperty(props, `on:${name}`, {
            configurable: true,
            enumerable: true,
            get,
          })
          installEvent(element, `on:${name}`, props, owner)
        }
      },
    })
  })
  return range
}

export interface TemplatePlan {
  readonly id: string
  readonly nodes: readonly StaticInstruction[]
  readonly slots?: readonly number[]
}
interface StaticInstruction {
  readonly op: 'element' | 'text' | 'anchor'
  readonly tag?: string
  readonly ns?: 'html' | 'svg' | 'mathml'
  readonly slot?: number
  readonly value?: string
  readonly attrs?: readonly (readonly [string, unknown])[]
  readonly children?: readonly StaticInstruction[]
}
export interface TemplateScope {
  attr(slot: number, name: string, get: () => unknown): void
  text(slot: number, get: () => unknown): void
  child(slot: number, get: () => Child): void
  event(slot: number, name: string, get: () => unknown): void
}
function normalizePlan(plan: TemplatePlan | readonly unknown[]): TemplatePlan {
  if (Array.isArray(plan)) {
    const slots = plan[2] as readonly number[] | undefined
    return slots
      ? {
          id: String(plan[0] ?? ''),
          nodes: (plan[1] as readonly StaticInstruction[]) ?? [],
          slots,
        }
      : {
          id: String(plan[0] ?? ''),
          nodes: (plan[1] as readonly StaticInstruction[]) ?? [],
        }
  }
  return plan as TemplatePlan
}
export function template(
  plan: TemplatePlan | readonly unknown[],
): TemplatePlan {
  return normalizePlan(plan)
}
export function instantiate(
  plan: TemplatePlan | readonly unknown[],
  setup: (scope: TemplateScope) => void,
): JSX.Element {
  return { kind: 'template', plan: normalizePlan(plan), setup }
}
export function component<P extends object>(
  fn: Component<P>,
  props: P,
): JSX.Element {
  return {
    kind: 'component',
    component: fn as Component,
    props: copyProps(props),
  }
}
export function dynamicChild(get: () => Child): JSX.Element {
  return instantiate(
    { id: 'dynamic-child', nodes: [{ op: 'anchor', slot: 0 }] },
    (scope) => scope.child(0, get),
  )
}

function snapshotKeys(value: object): Key[] {
  return Reflect.ownKeys(value)
}
function viewFor(props: object, keys: readonly Key[]): Props {
  const keySet = new Set(keys)
  return new Proxy(Object.create(null) as Props, {
    ownKeys: () => [...keys],
    has: (_target, key) => keySet.has(key),
    get: (_target, key) =>
      keySet.has(key) ? (props as Props)[key] : undefined,
    getOwnPropertyDescriptor: (_target, key) =>
      keySet.has(key)
        ? {
            configurable: true,
            enumerable: true,
            get: () => (props as Props)[key],
          }
        : undefined,
  })
}
export function splitProps<
  T extends object,
  const K extends readonly (keyof T)[],
>(props: T, keys: K): [Pick<T, K[number]>, Omit<T, K[number]>]
export function splitProps<
  T extends object,
  const G extends readonly (readonly (keyof T)[])[],
>(
  props: T,
  ...groups: G
): [
  ...viewsForGroups: {
    [I in keyof G]: G[I] extends readonly (keyof T)[]
      ? Pick<T, G[I][number]>
      : never
  },
  rest: Omit<T, G[number][number]>,
]
export function splitProps<T extends object>(
  props: T,
  ...groups: readonly (readonly (keyof T)[])[]
): object[] {
  const all = snapshotKeys(props)
  const claimed = new Set<PropertyKey>()
  const views = groups.map((group) => {
    const keys = group.filter((key) => all.includes(key as Key)) as Key[]
    keys.forEach((key) => claimed.add(key))
    return viewFor(props, keys)
  })
  return [
    ...views,
    viewFor(
      props,
      all.filter((key) => !claimed.has(key)),
    ),
  ]
}
type MergeRightToLeft<T extends readonly object[]> = T extends readonly [
  infer Head extends object,
  ...infer Tail extends readonly object[],
]
  ? MergeRightToLeft<Tail> & Head
  : object
export function mergeProps<T extends readonly object[]>(
  ...sources: T
): MergeRightToLeft<T> {
  const keys = [...new Set(sources.flatMap(snapshotKeys))] as Key[]
  const read = (key: PropertyKey): unknown => {
    for (let index = sources.length - 1; index >= 0; index--)
      if (
        (typeof key === 'string' || typeof key === 'symbol') &&
        Reflect.ownKeys(sources[index] as object).includes(key)
      )
        return (sources[index] as Props)[key]
    return undefined
  }
  return new Proxy(Object.create(null) as Props, {
    ownKeys: () => keys,
    get: (_target, key) => read(key),
    getOwnPropertyDescriptor: (_target, key) =>
      (typeof key === 'string' || typeof key === 'symbol') &&
      keys.includes(key as Key)
        ? { configurable: true, enumerable: true, get: () => read(key) }
        : undefined,
  }) as MergeRightToLeft<T>
}
export function children(source: () => Child): () => Child {
  const value = computed(source)
  let cached: Child
  let initialized = false
  return () => {
    const next = value()
    if (!initialized || !Object.is(next, cached)) {
      cached = next
      initialized = true
      if (childrenDiagnostics) markChildrenValue(cached)
    }
    return cached
  }
}

export function render(
  app: () => JSX.Element,
  host: Element | DocumentFragment | ShadowRoot,
): () => void {
  let disposeRoot = (): void => undefined
  let rootRange: DomRange = { nodes: [], owner: undefined as never }
  createRoot((dispose: () => void) => {
    disposeRoot = dispose
    const rootOwner = createInternalOwner('component', () =>
      rangeConnected(rootRange),
    )
    let output!: Child
    runWithOwner(rootOwner, () => {
      output = app()
    })
    rootRange = runWithOwner(rootOwner, () =>
      mountValue(output, host, null, rootOwner),
    )
    runWithOwner(rootOwner, () => onCleanup(() => removeRange(rootRange)))
    if (rangeConnected(rootRange)) notifyMount(rootOwner)
    else trackMount(rootOwner, rootRange)
  })
  return () => disposeRoot()
}

export interface ShowProps<T = unknown> {
  when: T | false | null | undefined
  fallback?: Child
  children:
    | Child
    | ((value: ReadonlySignal<Exclude<T, false | null | undefined>>) => Child)
}
export type ShowComponent = <T>(props: ShowProps<T>) => JSX.Element

export interface ForProps<T> {
  each: readonly T[]
  by?: (item: T) => PropertyKey
  fallback?: Child
  children: (item: () => T, index: () => number) => Child
}
export type ForComponent = <T>(props: ForProps<T>) => JSX.Element

export interface SwitchProps {
  fallback?: Child
  children?: Child
}
export type SwitchComponent = (props: SwitchProps) => JSX.Element

export interface MatchProps<T = unknown> {
  when: T | false | null | undefined
  children: Child
}
export type MatchComponent = <T>(props: MatchProps<T>) => JSX.Element

export interface DynamicProps<P extends object = Props> {
  component: string | Component<P> | null | undefined
  children?: Child
  [key: PropertyKey]: unknown
}
export type DynamicComponent = <P extends object = Props>(
  props: DynamicProps<P>,
) => JSX.Element

export interface PortalProps {
  mount: Node | null | undefined
  children?: Child
}
export type PortalComponent = (props: PortalProps) => JSX.Element

export interface ErrorBoundaryProps {
  children?: Child
  fallback: Child | ((error: unknown, reset: () => void) => Child)
  resetKeys?: readonly unknown[]
}
export type ErrorBoundaryComponent = (props: ErrorBoundaryProps) => JSX.Element

function controlMarker(_props: object): never {
  void _props
  throw new Error('Benos control components are compiler markers')
}
export const Show: ShowComponent = markControl(function Show<T>(
  props: ShowProps<T>,
): JSX.Element {
  return controlMarker(props)
}, 'show')
export const For: ForComponent = markControl(function For<T>(
  props: ForProps<T>,
): JSX.Element {
  return controlMarker(props)
}, 'for')
export const Switch: SwitchComponent = markControl(function Switch(
  props: SwitchProps,
): JSX.Element {
  return controlMarker(props)
}, 'switch')
export const Match: MatchComponent = markControl(function Match<T>(
  props: MatchProps<T>,
): JSX.Element {
  return controlMarker(props)
}, 'match')
export const Dynamic: DynamicComponent = markControl(function Dynamic<
  P extends object,
>(props: DynamicProps<P>): JSX.Element {
  return controlMarker(props)
}, 'dynamic')
export const Portal: PortalComponent = markControl(function Portal(
  props: PortalProps,
): JSX.Element {
  return controlMarker(props)
}, 'portal')
export const ErrorBoundary: ErrorBoundaryComponent = markControl(
  function ErrorBoundary(props: ErrorBoundaryProps): JSX.Element {
    return controlMarker(props)
  },
  'boundary',
)

// eslint-disable-next-line @typescript-eslint/no-namespace
export namespace JSX {
  export type Element = Descriptor
  export interface ElementChildrenAttribute {
    children: object
  }
  export type EventHandler<
    E extends Event,
    T extends globalThis.Element,
  > = GeneratedEventHandler<E, T>
  export type Style = GeneratedStyle
  export type Common<T extends globalThis.Element> = GeneratedAttributes<T>
  export type Html<T extends globalThis.Element> = GeneratedAttributes<T>
  export type IntrinsicElements = GeneratedIntrinsicElements
}
