export interface ReadonlySignal<T> {
  (): T
}

export interface Signal<T> extends ReadonlySignal<T> {
  set(value: T): void
  update(fn: (previous: T) => T): void
  readonly(): ReadonlySignal<T>
}

export interface SignalOptions<T> {
  equals?: false | ((previous: T, next: T) => boolean)
  name?: string
}

export interface Context<T> {
  readonly Provider: (props: { value: T; children?: unknown }) => unknown
}

type OwnerKind = 'root' | 'component' | 'branch' | 'effect-run' | 'boundary'
type Producer = StateNode<unknown> | ComputedNode<unknown>
type Consumer = ComputedNode<unknown> | EffectNode
type Computation = ComputedNode<unknown> | EffectNode
interface Dependency {
  source: Producer
  consumer: Consumer
  seenVersion: number
  seenEpoch: number
  prevSource: Dependency | null
  nextSource: Dependency | null
  prevSink: Dependency | null
  nextSink: Dependency | null
  active: boolean
}

interface Sources {
  firstSource: Dependency | null
  lastSource: Dependency | null
  sourceCount: number
  sourceMap: Map<Producer, Dependency> | null
  recycledSource: Dependency | null
  trackEpoch: number
}

interface Sinks {
  firstSink: Dependency | null
  lastSink: Dependency | null
  sinkCount: number
  debugEdges?: Set<Consumer>
}

interface Owner {
  parent: Owner | null
  firstChild: Owner | null
  lastChild: Owner | null
  prevSibling: Owner | null
  nextSibling: Owner | null
  cleanups: Array<() => void> | null
  contexts: Map<symbol, unknown> | null
  computations: Set<Computation> | null
  mountJobs: Set<MountJob> | null
  mountReady: (() => boolean) | null
  errorHandler: ((error: unknown) => void) | null
  hasResources: boolean
  disposed: boolean
  disposing: boolean
  kind: OwnerKind
}

interface StateNode<T> extends Sinks {
  kind: 'state'
  id: number
  value: T
  version: number
  equals: false | ((previous: T, next: T) => boolean)
  name: string | undefined
}

interface ComputedNode<T> extends Sources, Sinks {
  kind: 'computed'
  id: number
  evaluate: () => T
  cacheKind: 0 | 1 | 2 // uninitialized, value, error
  cachedValue: T | undefined
  cachedError: unknown
  version: number
  lastCheckedWriteVersion: number
  status: 'clean' | 'check' | 'running' | 'disposed'
  live: boolean
  owner: Owner
  markVersion: number
}

interface EffectNode extends Sources {
  kind: 'effect'
  id: number
  run: () => void
  tier: 'render' | 'user'
  queued: boolean
  prevQueue: EffectNode | null
  nextQueue: EffectNode | null
  hasRun: boolean
  disposed: boolean
  owner: Owner
  runOwner: Owner | null
  markVersion: number
  flushVersion: number
  executions: number
}

interface MountJob {
  run: () => void
  owner: Owner
  queued: boolean
  prevQueue: MountJob | null
  nextQueue: MountJob | null
  cancelled: boolean
}

const renderQueue: { head: EffectNode | null; tail: EffectNode | null } = {
  head: null,
  tail: null,
}
const userQueue: { head: EffectNode | null; tail: EffectNode | null } = {
  head: null,
  tail: null,
}
const mountQueue: { head: MountJob | null; tail: MountJob | null } = {
  head: null,
  tail: null,
}
const pendingErrors: unknown[] = []
const contextIds = new WeakMap<object, symbol>()
const contextDefaults = new WeakMap<object, unknown>()
const providerOwners = new WeakMap<object, Owner>()
const inspectedSignals = new WeakMap<() => unknown, StateNode<unknown>>()
const inspectedComputeds = new WeakMap<() => unknown, ComputedNode<unknown>>()
let currentOwner: Owner | null = null
let currentConsumer: Consumer | null = null
let trackingSuppression = 0
let computedDepth = 0
let batchDepth = 0
let setupDepth = 0
let flushing = false
let writeVersion = 0
let nextNodeId = 1
let nextUniqueId = 0
let flushVersion = 0
const development = process.env.NODE_ENV !== 'production'
const debugState = development
  ? {
      currentRunningEffect: null as EffectNode | null,
      recentWrites: [] as string[],
    }
  : null

function rejectComputedSideEffect(name: string): void {
  if (computedDepth !== 0)
    throw new Error(`${name} cannot run during computed evaluation`)
}

function createOwner(parent: Owner | null, kind: OwnerKind): Owner {
  const owner: Owner = {
    parent,
    firstChild: null,
    lastChild: null,
    prevSibling: parent?.lastChild ?? null,
    nextSibling: null,
    cleanups: null,
    contexts: null,
    computations: null,
    mountJobs: null,
    mountReady: null,
    errorHandler: null,
    hasResources: false,
    disposed: false,
    disposing: false,
    kind,
  }
  if (parent) {
    parent.hasResources = true
    if (parent.lastChild) parent.lastChild.nextSibling = owner
    else parent.firstChild = owner
    parent.lastChild = owner
  }
  return owner
}

function unlinkOwner(owner: Owner): void {
  const parent = owner.parent
  if (!parent) return
  if (owner.prevSibling) owner.prevSibling.nextSibling = owner.nextSibling
  else parent.firstChild = owner.nextSibling
  if (owner.nextSibling) owner.nextSibling.prevSibling = owner.prevSibling
  else parent.lastChild = owner.prevSibling
  owner.parent = null
  owner.prevSibling = null
  owner.nextSibling = null
}

function own(owner: Owner, node: Computation): void {
  owner.hasResources = true
  ;(owner.computations ??= new Set()).add(node)
}

function syntheticOwner(kind: 'computed' | 'effect'): Owner {
  if (development)
    console.warn(
      `Ownerless ${kind} has a detached lifetime; dispose ownerless effects explicitly.`,
    )
  return createOwner(null, 'root')
}

function routeError(error: unknown, from: Owner | null): void {
  let owner = from
  while (owner) {
    if (!owner.disposed && !owner.disposing && owner.errorHandler) {
      try {
        owner.errorHandler(error)
        return
      } catch (nextError) {
        error = nextError
      }
    }
    owner = owner.parent
  }
  pendingErrors.push(error)
}

function reportError(error: unknown): void {
  try {
    const host = globalThis as typeof globalThis & {
      reportError?: (error: unknown) => void
    }
    if (typeof host.reportError === 'function') host.reportError(error)
    else console.error(error)
  } catch {
    // Reporting must not make a signal write throw.
  }
}

export function reportInternalError(error: unknown): void {
  reportError(error)
}

function reportPendingErrors(): void {
  if (pendingErrors.length === 0) return
  for (const error of pendingErrors.splice(0)) reportError(error)
}

function unlinkSource(edge: Dependency): void {
  const node = edge.consumer
  if (edge.active) unlinkSink(edge)
  if (edge.prevSource) edge.prevSource.nextSource = edge.nextSource
  else node.firstSource = edge.nextSource
  if (edge.nextSource) edge.nextSource.prevSource = edge.prevSource
  else node.lastSource = edge.prevSource
  node.sourceCount--
  node.sourceMap?.delete(edge.source)
  edge.prevSource = null
  edge.nextSource = null
  if (
    !node.recycledSource &&
    !(node.kind === 'effect' ? node.disposed : node.status === 'disposed')
  ) {
    // An inactive pooled edge must not retain its former producer.
    edge.source = null as unknown as Producer
    node.recycledSource = edge
  }
}

function disposeComputed(node: ComputedNode<unknown>): void {
  if (node.status === 'disposed') return
  node.status = 'disposed'
  while (node.firstSource) unlinkSource(node.firstSource)
  while (node.firstSink) unlinkSink(node.firstSink)
  node.recycledSource = null
  node.owner.computations?.delete(node)
}

function disposeEffect(
  node: EffectNode,
  errors: Array<[unknown, Owner]>,
): void {
  if (node.disposed) return
  node.disposed = true
  removeQueuedEffect(node)
  while (node.firstSource) unlinkSource(node.firstSource)
  node.recycledSource = null
  node.owner.computations?.delete(node)
  if (node.runOwner) {
    collectDisposal(node.runOwner, errors)
    node.runOwner = null
  }
}

function detachDependencyFreeEffect(node: EffectNode): void {
  if (node.sourceCount) return
  node.owner.computations?.delete(node)
  if (node.runOwner && !node.runOwner.hasResources) {
    unlinkOwner(node.runOwner)
    node.runOwner = null
  }
}

function collectDisposal(owner: Owner, errors: Array<[unknown, Owner]>): void {
  if (owner.disposed) return
  owner.disposed = true
  owner.disposing = true
  while (owner.lastChild) collectDisposal(owner.lastChild, errors)
  if (owner.computations) {
    for (const node of owner.computations) {
      if (node.kind === 'effect') disposeEffect(node, errors)
      else disposeComputed(node)
    }
    owner.computations.clear()
  }
  if (owner.mountJobs) {
    for (const job of owner.mountJobs) {
      job.cancelled = true
      removeQueuedMount(job)
    }
    owner.mountJobs.clear()
  }
  if (owner.cleanups) {
    const previousOwner = currentOwner
    currentOwner = owner
    try {
      for (let index = owner.cleanups.length - 1; index >= 0; index--) {
        try {
          owner.cleanups[index]?.()
        } catch (error) {
          errors.push([error, owner.parent ?? owner])
        }
      }
    } finally {
      currentOwner = previousOwner
    }
    owner.cleanups = null
  }
  owner.contexts = null
  owner.errorHandler = null
  owner.disposing = false
  unlinkOwner(owner)
}

function finishDisposal(errors: Array<[unknown, Owner]>): void {
  if (errors.length === 0) return
  const before = pendingErrors.length
  for (const [error, owner] of errors) routeError(error, owner)
  if (!flushing && pendingErrors.length > before) {
    const unhandled = pendingErrors.splice(before)
    if (unhandled.length === 1) throw unhandled[0]
    throw new AggregateError(unhandled, 'Multiple cleanup errors')
  }
}

function disposeOwner(owner: Owner): void {
  const errors: Array<[unknown, Owner]> = []
  collectDisposal(owner, errors)
  finishDisposal(errors)
}

export function createRoot<T>(fn: (dispose: () => void) => T): T {
  rejectComputedSideEffect('createRoot')
  const root = createOwner(null, 'root')
  const previousOwner = currentOwner
  let result!: T
  let failed = false
  let thrown: unknown
  setupDepth++
  currentOwner = root
  try {
    result = fn(() => disposeOwner(root))
  } catch (error) {
    failed = true
    thrown = error
  } finally {
    currentOwner = previousOwner
    if (failed) {
      try {
        disposeOwner(root)
      } catch (error) {
        reportError(error)
      }
    }
    setupDepth--
    maybeFlush()
  }
  if (failed) throw thrown
  return result
}

export function createUniqueId(): string {
  if (!currentOwner || currentOwner.disposed || currentOwner.disposing)
    throw new Error('createUniqueId requires an active owner')
  return `b${nextUniqueId++}`
}

export function onCleanup(fn: () => void): void {
  rejectComputedSideEffect('onCleanup')
  const owner = currentOwner
  if (!owner || owner.disposed || owner.disposing)
    throw new Error('onCleanup requires an active owner')
  owner.hasResources = true
  ;(owner.cleanups ??= []).push(fn)
}

function enqueueMount(job: MountJob): void {
  if (job.queued || job.cancelled || job.owner.disposed) return
  job.queued = true
  job.prevQueue = mountQueue.tail
  job.nextQueue = null
  if (mountQueue.tail) mountQueue.tail.nextQueue = job
  else mountQueue.head = job
  mountQueue.tail = job
}

function dequeueMount(): MountJob | null {
  const job = mountQueue.head
  if (!job) return null
  removeQueuedMount(job)
  return job
}

function removeQueuedMount(job: MountJob): void {
  if (!job.queued) return
  if (job.prevQueue) job.prevQueue.nextQueue = job.nextQueue
  else mountQueue.head = job.nextQueue
  if (job.nextQueue) job.nextQueue.prevQueue = job.prevQueue
  else mountQueue.tail = job.prevQueue
  job.prevQueue = null
  job.nextQueue = null
  job.queued = false
}

export function onMount(fn: () => void): void {
  rejectComputedSideEffect('onMount')
  let owner = currentOwner
  while (owner && (owner.kind !== 'component' || !owner.mountReady))
    owner = owner.parent
  if (!owner || owner.disposed)
    throw new Error('onMount requires a renderer-associated component owner')
  const job: MountJob = {
    run: fn,
    owner,
    queued: false,
    prevQueue: null,
    nextQueue: null,
    cancelled: false,
  }
  ;(owner.mountJobs ??= new Set()).add(job)
  owner.hasResources = true
  if (owner.mountReady?.()) enqueueMount(job)
  maybeFlush()
}

export function createContext<T>(defaultValue: T): Context<T> {
  const id = Symbol('context')
  const context: Context<T> = {
    Provider(props): unknown {
      rejectComputedSideEffect('Provider')
      const parent = currentOwner
      if (!parent || parent.disposed)
        throw new Error('Provider requires an active owner')
      const captured = untrack(() => props.value)
      const child = createOwner(parent, 'branch')
      child.hasResources = true
      ;(child.contexts ??= new Map()).set(id, captured)
      const result = runWithOwner(child, () => {
        if (development) {
          let warned = false
          effect(() => {
            const next = props.value
            if (!warned && !Object.is(next, captured)) {
              warned = true
              console.warn(
                'Provider value changed after creation; remount to replace it.',
              )
            }
          })
        }
        const children = props.children
        return typeof children === 'function'
          ? (children as () => unknown)()
          : children
      })
      if (
        (typeof result === 'object' && result !== null) ||
        typeof result === 'function'
      )
        providerOwners.set(result, child)
      return result
    },
  }
  contextIds.set(context, id)
  contextDefaults.set(context, defaultValue)
  return context
}

export function getContext<T>(context: Context<T>): T {
  let owner = currentOwner
  if (!owner) throw new Error('getContext requires an active owner')
  const id = contextIds.get(context)
  if (!id) return contextDefaults.get(context) as T
  while (owner) {
    if (owner.contexts?.has(id)) return owner.contexts.get(id) as T
    owner = owner.parent
  }
  return contextDefaults.get(context) as T
}

function linkSink(edge: Dependency): void {
  if (edge.active) return
  const source = edge.source
  edge.active = true
  edge.prevSink = source.lastSink
  edge.nextSink = null
  if (source.lastSink) source.lastSink.nextSink = edge
  else source.firstSink = edge
  source.lastSink = edge
  source.sinkCount++
  source.debugEdges?.add(edge.consumer)
  if (source.kind === 'computed' && source.sinkCount === 1) {
    source.live = true
    for (
      let dependency = source.firstSource;
      dependency;
      dependency = dependency.nextSource
    )
      linkSink(dependency)
  }
}

function unlinkSink(edge: Dependency): void {
  if (!edge.active) return
  const source = edge.source
  if (edge.prevSink) edge.prevSink.nextSink = edge.nextSink
  else source.firstSink = edge.nextSink
  if (edge.nextSink) edge.nextSink.prevSink = edge.prevSink
  else source.lastSink = edge.prevSink
  edge.prevSink = null
  edge.nextSink = null
  edge.active = false
  source.sinkCount--
  source.debugEdges?.delete(edge.consumer)
  if (source.kind === 'computed' && source.sinkCount === 0) {
    source.live = false
    for (
      let dependency = source.firstSource;
      dependency;
      dependency = dependency.nextSource
    )
      unlinkSink(dependency)
  }
}

function moveSourceToTail(node: Sources, edge: Dependency): void {
  if (node.lastSource === edge) return
  if (edge.prevSource) edge.prevSource.nextSource = edge.nextSource
  else node.firstSource = edge.nextSource
  if (edge.nextSource) edge.nextSource.prevSource = edge.prevSource
  edge.prevSource = node.lastSource
  edge.nextSource = null
  if (node.lastSource) node.lastSource.nextSource = edge
  node.lastSource = edge
}

function track(source: Producer): void {
  const consumer = trackingSuppression === 0 ? currentConsumer : null
  if (!consumer || (consumer.kind === 'effect' && consumer.disposed)) return
  let edge = consumer.firstSource
  if (edge?.source !== source) {
    if (consumer.sourceMap) edge = consumer.sourceMap.get(source) ?? null
    else {
      edge = edge?.nextSource ?? null
      while (edge && edge.source !== source) edge = edge.nextSource
    }
  }
  if (edge?.seenEpoch === consumer.trackEpoch) return
  if (edge) {
    edge.seenEpoch = consumer.trackEpoch
    edge.seenVersion = source.version
    moveSourceToTail(consumer, edge)
    return
  }
  edge = consumer.recycledSource
  if (edge) {
    consumer.recycledSource = null
    edge.source = source
    edge.seenVersion = source.version
    edge.seenEpoch = consumer.trackEpoch
    edge.prevSource = consumer.lastSource
  } else {
    edge = {
      source,
      consumer,
      seenVersion: source.version,
      seenEpoch: consumer.trackEpoch,
      prevSource: consumer.lastSource,
      nextSource: null,
      prevSink: null,
      nextSink: null,
      active: false,
    }
  }
  if (consumer.lastSource) consumer.lastSource.nextSource = edge
  else consumer.firstSource = edge
  consumer.lastSource = edge
  consumer.sourceCount++
  if (consumer.sourceCount === 5) {
    consumer.sourceMap = new Map()
    for (
      let existing = consumer.firstSource;
      existing;
      existing = existing.nextSource
    )
      consumer.sourceMap.set(existing.source, existing)
  } else consumer.sourceMap?.set(source, edge)
  if (consumer.kind === 'effect' || consumer.live) linkSink(edge)
}

function finishTracking(node: Consumer, failed: boolean): void {
  let edge = node.firstSource
  while (edge) {
    const next = edge.nextSource
    if (edge.seenEpoch !== node.trackEpoch) {
      if (failed) edge.seenVersion = edge.source.version
      else unlinkSource(edge)
    }
    edge = next
  }
}

function readComputed<T>(source: ComputedNode<T>): T {
  try {
    ensureFresh(source)
  } catch (error) {
    track(source as Producer)
    throw error
  }
  track(source as Producer)
  if (source.cacheKind === 2) throw source.cachedError
  if (source.cacheKind === 1) return source.cachedValue as T
  throw new Error('Computed value is uninitialized')
}

function ensureFresh<T>(node: ComputedNode<T>): void {
  if (node.status === 'disposed') throw new Error('Computed owner is disposed')
  if (node.status === 'running')
    throw new Error(
      development
        ? `Recursive computed read at computed#${node.id}`
        : 'Recursive computed read',
    )
  if (node.cacheKind !== 0) {
    if (node.live && node.status === 'clean') return
    if (!node.live && node.lastCheckedWriteVersion === writeVersion) return
    let changed = false
    for (
      let dependency = node.firstSource;
      dependency;
      dependency = dependency.nextSource
    ) {
      if (dependency.source.kind === 'computed') {
        try {
          ensureFresh(dependency.source)
        } catch {
          // The cached error is observed by the evaluation below.
        }
      }
      if (dependency.seenVersion !== dependency.source.version) changed = true
    }
    if (!changed) {
      node.status = 'clean'
      node.lastCheckedWriteVersion = writeVersion
      return
    }
  }
  const previousConsumer = currentConsumer
  const previousSuppression = trackingSuppression
  currentConsumer = node as ComputedNode<unknown>
  trackingSuppression = 0
  computedDepth++
  node.status = 'running'
  node.trackEpoch++
  let next!: T
  let failure: unknown
  let failed = false
  try {
    next = node.evaluate()
  } catch (error) {
    failed = true
    failure = error
  } finally {
    computedDepth--
    currentConsumer = previousConsumer
    trackingSuppression = previousSuppression
  }
  finishTracking(node as ComputedNode<unknown>, failed)
  const previousKind = node.cacheKind
  const previousValue = node.cachedValue
  if (failed) {
    node.cacheKind = 2
    node.cachedError = failure
    node.version++
  } else {
    node.cacheKind = 1
    node.cachedValue = next
    if (previousKind !== 1 || !Object.is(previousValue, next)) node.version++
  }
  node.lastCheckedWriteVersion = writeVersion
  node.status = 'clean'
  if (failed) throw failure
}

function notifySinks(source: Producer): void {
  for (let edge = source.firstSink; edge; edge = edge.nextSink) {
    const consumer = edge.consumer
    if (consumer.markVersion === writeVersion) continue
    consumer.markVersion = writeVersion
    if (consumer.kind === 'computed') {
      if (consumer.status === 'disposed') continue
      consumer.status = 'check'
      notifySinks(consumer)
    } else enqueueEffect(consumer)
  }
}

export function signal<T>(initial: T, options?: SignalOptions<T>): Signal<T> {
  rejectComputedSideEffect('signal')
  const node: StateNode<T> = {
    kind: 'state',
    id: nextNodeId++,
    value: initial,
    version: 0,
    equals: options?.equals ?? Object.is,
    firstSink: null,
    lastSink: null,
    sinkCount: 0,
    name: options?.name,
  }
  const read = (() => {
    track(node as StateNode<unknown>)
    return node.value
  }) as Signal<T>
  const readonly = (() => {
    track(node as StateNode<unknown>)
    return node.value
  }) as ReadonlySignal<T>
  read.set = (value) => {
    rejectComputedSideEffect('signal.set')
    if (node.equals !== false && node.equals(node.value, value)) return
    if (
      node.version === Number.MAX_SAFE_INTEGER ||
      writeVersion === Number.MAX_SAFE_INTEGER
    )
      throw new Error('Signal version limit reached')
    node.value = value
    node.version++
    writeVersion++
    if (development && debugState?.currentRunningEffect) {
      debugState.recentWrites.push(
        `effect#${debugState.currentRunningEffect.id} -> ${node.name ?? `signal#${node.id}`}`,
      )
      if (debugState.recentWrites.length > 8) debugState.recentWrites.shift()
    }
    notifySinks(node as StateNode<unknown>)
    maybeFlush()
  }
  read.update = (fn) => {
    rejectComputedSideEffect('signal.update')
    read.set(fn(node.value))
  }
  read.readonly = () => readonly
  inspectedSignals.set(read, node as StateNode<unknown>)
  return read
}

export function computed<T>(fn: () => T): ReadonlySignal<T> {
  rejectComputedSideEffect('computed')
  const owner = currentOwner ?? syntheticOwner('computed')
  const node: ComputedNode<T> = {
    kind: 'computed',
    id: nextNodeId++,
    evaluate: fn,
    cacheKind: 0,
    cachedValue: undefined,
    cachedError: undefined,
    version: 0,
    lastCheckedWriteVersion: -1,
    status: 'clean',
    firstSource: null,
    lastSource: null,
    sourceCount: 0,
    sourceMap: null,
    recycledSource: null,
    trackEpoch: 0,
    firstSink: null,
    lastSink: null,
    sinkCount: 0,
    live: false,
    owner,
    markVersion: -1,
  }
  own(owner, node as ComputedNode<unknown>)
  const read = () => readComputed(node)
  inspectedComputeds.set(read, node as ComputedNode<unknown>)
  return read
}

function enqueueEffect(node: EffectNode): void {
  if (node.disposed || node.queued) return
  const queue = node.tier === 'render' ? renderQueue : userQueue
  node.queued = true
  node.prevQueue = queue.tail
  node.nextQueue = null
  if (queue.tail) queue.tail.nextQueue = node
  else queue.head = node
  queue.tail = node
}

function dequeueEffect(queue: {
  head: EffectNode | null
  tail: EffectNode | null
}): EffectNode | null {
  const node = queue.head
  if (!node) return null
  removeQueuedEffect(node)
  return node
}

function removeQueuedEffect(node: EffectNode): void {
  if (!node.queued) return
  const queue = node.tier === 'render' ? renderQueue : userQueue
  if (node.prevQueue) node.prevQueue.nextQueue = node.nextQueue
  else queue.head = node.nextQueue
  if (node.nextQueue) node.nextQueue.prevQueue = node.prevQueue
  else queue.tail = node.prevQueue
  node.prevQueue = null
  node.nextQueue = null
  node.queued = false
}

function runEffect(node: EffectNode): void {
  if (node.disposed || node.owner.disposed) return
  if (node.hasRun) {
    const first = node.firstSource
    if (first && !first.nextSource && first.source.kind === 'state') {
      if (first.seenVersion === first.source.version) return
    } else {
      let changed = false
      for (
        let dependency = first;
        dependency;
        dependency = dependency.nextSource
      ) {
        if (dependency.source.kind === 'computed') {
          try {
            ensureFresh(dependency.source)
          } catch {
            // A changed computed error is delivered by the effect's own read.
          }
        }
        if (dependency.seenVersion !== dependency.source.version) changed = true
      }
      if (!changed) return
    }
  }
  if (node.flushVersion !== flushVersion) {
    node.flushVersion = flushVersion
    node.executions = 0
  }
  if (++node.executions > 100) {
    const errors: Array<[unknown, Owner]> = []
    disposeEffect(node, errors)
    finishDisposal(errors)
    routeError(
      new Error(
        development
          ? `Effect cycle exceeded 100 runs at effect#${node.id}; write path: ${debugState?.recentWrites.join(' -> ')}`
          : 'Effect cycle exceeded 100 runs in one flush',
      ),
      node.owner,
    )
    return
  }
  const canReuseRunOwner = node.runOwner && !node.runOwner.hasResources
  if (node.runOwner && !canReuseRunOwner) {
    const errors: Array<[unknown, Owner]> = []
    collectDisposal(node.runOwner, errors)
    finishDisposal(errors)
  }
  const runOwner =
    canReuseRunOwner && node.runOwner
      ? node.runOwner
      : createOwner(node.owner, 'effect-run')
  node.runOwner = runOwner
  const previousOwner = currentOwner
  const previousConsumer = currentConsumer
  const previousSuppression = trackingSuppression
  const previousRunningEffect = development
    ? (debugState?.currentRunningEffect ?? null)
    : null
  currentOwner = runOwner
  currentConsumer = node
  if (development && debugState) debugState.currentRunningEffect = node
  trackingSuppression = 0
  node.trackEpoch++
  let failed = false
  let failure: unknown
  try {
    node.run()
  } catch (error) {
    failed = true
    failure = error
  } finally {
    currentOwner = previousOwner
    currentConsumer = previousConsumer
    if (development && debugState)
      debugState.currentRunningEffect = previousRunningEffect
    trackingSuppression = previousSuppression
  }
  if (node.disposed) return
  if (node.sourceCount !== 1 || node.firstSource?.seenEpoch !== node.trackEpoch)
    finishTracking(node, failed)
  node.hasRun = true
  if (failed) routeError(failure, runOwner)
  detachDependencyFreeEffect(node)
}

function runMount(job: MountJob): void {
  if (job.cancelled || job.owner.disposed) return
  if (!job.owner.mountReady?.()) return
  job.cancelled = true
  job.owner.mountJobs?.delete(job)
  const previousOwner = currentOwner
  const previousConsumer = currentConsumer
  currentOwner = job.owner
  currentConsumer = null
  try {
    job.run()
  } catch (error) {
    routeError(error, job.owner)
  } finally {
    currentOwner = previousOwner
    currentConsumer = previousConsumer
  }
}

function flush(): void {
  if (flushing) return
  flushing = true
  flushVersion++
  if (development && debugState) debugState.recentWrites.length = 0
  try {
    while (renderQueue.head || userQueue.head || mountQueue.head) {
      let render: EffectNode | null
      while ((render = dequeueEffect(renderQueue))) runEffect(render)
      const user = dequeueEffect(userQueue)
      if (user) runEffect(user)
      else {
        const mount = dequeueMount()
        if (mount) runMount(mount)
      }
    }
  } finally {
    flushing = false
    reportPendingErrors()
  }
}

function maybeFlush(): void {
  if (batchDepth === 0 && setupDepth === 0 && !flushing) flush()
}

function createEffect(fn: () => void, tier: 'render' | 'user'): () => void {
  rejectComputedSideEffect('effect')
  const owner = currentOwner ?? syntheticOwner('effect')
  const node: EffectNode = {
    kind: 'effect',
    id: nextNodeId++,
    run: fn,
    firstSource: null,
    lastSource: null,
    sourceCount: 0,
    sourceMap: null,
    recycledSource: null,
    trackEpoch: 0,
    tier,
    queued: false,
    prevQueue: null,
    nextQueue: null,
    hasRun: false,
    disposed: false,
    owner,
    runOwner: null,
    markVersion: -1,
    flushVersion: -1,
    executions: 0,
  }
  own(owner, node)
  enqueueEffect(node)
  maybeFlush()
  return () => {
    if (node.hasRun && node.sourceCount === 0) return
    const errors: Array<[unknown, Owner]> = []
    disposeEffect(node, errors)
    finishDisposal(errors)
  }
}

export function effect(fn: () => void): () => void {
  return createEffect(fn, 'user')
}

export function batch<T>(fn: () => T): T {
  batchDepth++
  try {
    return fn()
  } finally {
    batchDepth--
    maybeFlush()
  }
}

export function untrack<T>(fn: () => T): T {
  trackingSuppression++
  try {
    return fn()
  } finally {
    trackingSuppression--
  }
}

// Private renderer hooks; the public package entry point does not export them.
export function createInternalOwner(
  kind: OwnerKind,
  mountReady?: () => boolean,
): Owner {
  const parent = currentOwner
  if (!parent || parent.disposed)
    throw new Error('Child owner requires a parent')
  const owner = createOwner(parent, kind)
  owner.mountReady = mountReady ?? null
  return owner
}

export function runWithOwner<T>(owner: Owner, fn: () => T): T {
  if (owner.disposed) throw new Error('Owner is disposed')
  const previous = currentOwner
  currentOwner = owner
  try {
    return fn()
  } finally {
    currentOwner = previous
  }
}

export function disposeInternalOwner(owner: Owner): void {
  disposeOwner(owner)
}

export function setInternalErrorHandler(
  owner: Owner,
  handler: (error: unknown) => void,
): void {
  owner.errorHandler = handler
  owner.hasResources = true
}

export function createRenderEffect(fn: () => void): () => void {
  return createEffect(fn, 'render')
}

export function notifyMount(owner: Owner): void {
  if (owner.disposed || !owner.mountReady?.()) return
  for (const job of owner.mountJobs ?? []) enqueueMount(job)
  maybeFlush()
}

export function hasPendingMounts(owner: Owner): boolean {
  return Boolean(owner.mountJobs?.size)
}

export function getInternalProviderOwner(value: unknown): Owner | null {
  if (
    (typeof value !== 'object' || value === null) &&
    typeof value !== 'function'
  )
    return null
  return providerOwners.get(value) ?? null
}

// Private, read-only diagnostic hooks for deterministic graph-lifetime tests.
export function inspectInternalSignal(read: () => unknown): {
  id: number
  version: number
  subscribers: number
  edges: ReadonlySet<unknown>
} {
  const node = inspectedSignals.get(read)
  if (!node) throw new Error('Unknown signal')
  if (!node.debugEdges) {
    node.debugEdges = new Set()
    for (let edge = node.firstSink; edge; edge = edge.nextSink)
      node.debugEdges.add(edge.consumer)
  }
  return {
    id: node.id,
    version: node.version,
    subscribers: node.sinkCount,
    edges: node.debugEdges,
  }
}

export function inspectInternalComputed(read: () => unknown): {
  sources: number
  sourceIds: number[]
  subscribers: number
  live: boolean
  disposed: boolean
} {
  const node = inspectedComputeds.get(read)
  if (!node) throw new Error('Unknown computed')
  const sourceIds: number[] = []
  for (let edge = node.firstSource; edge; edge = edge.nextSource)
    sourceIds.push(edge.source.id)
  return {
    sources: node.sourceCount,
    sourceIds,
    subscribers: node.sinkCount,
    live: node.live,
    disposed: node.status === 'disposed',
  }
}

export function inspectInternalQueues(): {
  render: number
  user: number
  mount: number
} {
  const count = (head: { nextQueue: unknown } | null): number => {
    let size = 0
    let node = head
    while (node) {
      size++
      node = node.nextQueue as { nextQueue: unknown } | null
    }
    return size
  }
  return {
    render: count(renderQueue.head),
    user: count(userQueue.head),
    mount: count(mountQueue.head),
  }
}
