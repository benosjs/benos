import {
  batch,
  createContext,
  getContext,
  onCleanup,
  signal,
  untrack,
} from '@benosjs/core'
import type { ReadonlySignal } from '@benosjs/core'
import {
  createRenderEffect,
  hasInternalGatedRender,
  runWithOwner,
  setInternalOwnerGate,
} from '@benosjs/core/internal'
import { internalRequest } from '@benosjs/core/internal'
import {
  prepareInternalStage,
  registerInternalControl,
} from '@benosjs/dom/internal'
import type { Child, JSX } from '@benosjs/dom'

export type ResourceState =
  | { status: 'disabled' }
  | { status: 'pending' }
  | { status: 'ready' }
  | { status: 'failed'; error: unknown }

export interface Resource<T> {
  value: ReadonlySignal<T | undefined>
  state: ReadonlySignal<ResourceState>
  read(): T | undefined
  refresh(): Promise<T | undefined>
  cancel(): void
}

export interface InitializedResource<T> extends Omit<
  Resource<T>,
  'value' | 'read'
> {
  value: ReadonlySignal<T>
  read(): T
}

export interface ResourceOptions<S, T> {
  initialValue?: T
  ssr?: {
    id: string
    key(source: S): string
    serialize(value: T): unknown
    deserialize(value: unknown): T
  }
}

interface PendingToken {
  listeners: Set<() => void>
}

interface Boundary {
  observe(token: PendingToken): () => void
}

interface BoundaryController extends Boundary {
  parent: Boundary | null
  begin(): void
  abort(): void
  finish(): Promise<void>
}

const boundaryContext = createContext<Boundary | null>(null)
const controllers = new Set<BoundaryController>()

export function resource<S, T>(
  source: () => S | false | null | undefined,
  fetcher: (key: S, context: { signal: AbortSignal }) => T | Promise<T>,
  options: ResourceOptions<S, T> & { initialValue: T },
): InitializedResource<T>
export function resource<S, T>(
  source: () => S | false | null | undefined,
  fetcher: (key: S, context: { signal: AbortSignal }) => T | Promise<T>,
  options?: ResourceOptions<S, T>,
): Resource<T>
export function resource<S, T>(
  source: () => S | false | null | undefined,
  fetcher: (key: S, context: { signal: AbortSignal }) => T | Promise<T>,
  options?: ResourceOptions<S, T>,
): Resource<T> {
  const currentValue = signal<T | undefined>(options?.initialValue)
  const currentState = signal<ResourceState>({ status: 'disabled' })
  const request = internalRequest()
  const ssr = options?.ssr
  // Server and hydrating roots exchange snapshots keyed by codec id and key.
  const snapshotKey = (key: S): string => `${ssr?.id}\u0000${ssr?.key(key)}`
  let disposed = false
  let generation = 0
  let observedKey: S | false | null | undefined
  let observed = false
  let active: {
    controller: AbortController
    token: PendingToken
    resolve: (value: T | undefined) => void
    key?: S
    permanent?: boolean
  } | null = null

  const close = (request: NonNullable<typeof active>): void => {
    request.controller.abort()
    request.resolve(undefined)
    queueMicrotask(() => {
      for (const listener of request.token.listeners) listener()
      request.token.listeners.clear()
    })
  }

  const invalidate = (): void => {
    generation++
    if (active) close(active)
    active = null
  }

  const launch = (key: S): Promise<T | undefined> => {
    invalidate()
    const id = generation
    const controller = new AbortController()
    const token: PendingToken = { listeners: new Set() }
    let resolve!: (value: T | undefined) => void
    const result = new Promise<T | undefined>((done) => {
      resolve = done
    })
    const pending: NonNullable<typeof active> = {
      controller,
      token,
      resolve,
      key,
    }
    active = pending
    currentState.set({ status: 'pending' })
    if (request?.mode === 'server') {
      // Without a codec the server never fetches: the boundary stays in
      // fallback and the client fetches after hydration.
      if (!ssr) {
        pending.permanent = true
        return result
      }
      request.track?.(result)
    }
    let fetched: T | Promise<T>
    try {
      fetched = untrack(() => fetcher(key, { signal: controller.signal }))
    } catch (error) {
      settle(false, error, id, pending)
      return result
    }
    Promise.resolve(fetched).then(
      (value) => settle(true, value, id, pending),
      (error: unknown) => settle(false, error, id, pending),
    )
    return result
  }

  const settle = (
    success: boolean,
    outcome: unknown,
    id: number,
    pending: NonNullable<typeof active>,
  ): void => {
    if (disposed || id !== generation || active !== pending) return
    if (request?.mode === 'server') {
      if (success) {
        try {
          request.resources.set(
            snapshotKey(pending.key as S),
            ssr?.serialize(outcome as T),
          )
        } catch (error) {
          success = false
          outcome = error
        }
      }
      if (!success) {
        // A server failure stays pending: nothing is serialized, the boundary
        // keeps its fallback, and the client fetches again.
        pending.permanent = true
        pending.resolve(undefined)
        request.onError?.(outcome, { phase: 'data' })
        return
      }
    }
    active = null
    batch(() => {
      if (success) {
        currentValue.set(outcome as T)
        currentState.set({ status: 'ready' })
      } else currentState.set({ status: 'failed', error: outcome })
    })
    pending.resolve(success ? (outcome as T) : undefined)
    for (const listener of pending.token.listeners) listener()
    pending.token.listeners.clear()
  }

  const update = (key: S | false | null | undefined): void => {
    if (observed && Object.is(observedKey, key)) return
    observed = true
    observedKey = key
    if (key === false || key === null || key === undefined) {
      invalidate()
      currentState.set({ status: 'disabled' })
    } else if (request?.mode === 'hydrate' && ssr) {
      const snapshot = snapshotKey(key)
      if (request.resources.has(snapshot)) {
        const value = ssr.deserialize(request.resources.get(snapshot))
        request.resources.delete(snapshot)
        invalidate()
        batch(() => {
          currentValue.set(value)
          currentState.set({ status: 'ready' })
        })
      } else void launch(key)
    } else void launch(key)
  }

  onCleanup(() => {
    disposed = true
    invalidate()
  })
  update(untrack(source))
  createRenderEffect(() => update(source()))

  return {
    value: currentValue.readonly(),
    state: currentState.readonly(),
    read() {
      const state = currentState()
      if (state.status === 'failed') throw state.error
      if (state.status === 'pending' && active) {
        let boundary: Boundary | null = null
        try {
          boundary = getContext(boundaryContext)
        } catch {
          // Imperative reads have no current owner.
        }
        if (boundary) onCleanup(boundary.observe(active.token))
        else if (active.permanent && !ssr)
          throw new Error(
            'A resource without an ssr codec can only be read inside Suspense during server rendering',
          )
      }
      return currentValue()
    },
    refresh() {
      if (disposed || observedKey === false || observedKey == null)
        return Promise.resolve(undefined)
      return launch(observedKey)
    },
    cancel() {
      if (disposed) return
      invalidate()
      currentState.set({ status: 'disabled' })
    },
  }
}

export interface SuspenseProps {
  fallback: Child
  children?: Child
}

export function Suspense(_props: SuspenseProps): JSX.Element {
  void _props
  throw new Error('Suspense requires the Benos DOM renderer')
}

registerInternalControl(Suspense, (props, parent, before, owner, host) => {
  const marker = host.comment(parent, before)
  host.insert(parent, marker, before)
  let disposed = false
  let fallback: ReturnType<typeof prepareInternalStage> | null = null
  let content: ReturnType<typeof prepareInternalStage> | null = null
  let candidate: ReturnType<typeof prepareInternalStage> | null = null
  let visible = false
  let transitioning = false
  let ordinaryScheduled = false
  let epoch = 0
  let done: (() => void) | null = null
  const tokens = new Map<
    PendingToken,
    { count: number; listener: () => void }
  >()
  const clearTokens = (): void => {
    for (const [token, entry] of tokens) token.listeners.delete(entry.listener)
    tokens.clear()
  }
  const reveal = (): void => {
    if (disposed) return
    if (tokens.size) {
      // Hydrated content was claimed in place; it must not show while pending.
      if (content && !visible) content.hold?.()
      return
    }
    if (candidate) {
      content?.dispose()
      content = candidate
      candidate = null
      content.commit(marker)
      visible = true
      transitioning = false
      done?.()
      done = null
    } else if (content && !visible) {
      fallback?.dispose()
      fallback = null
      content.commit(marker)
      visible = true
    }
  }
  const outer = getContext(boundaryContext)
  const boundary: BoundaryController = {
    parent: outer,
    observe(token) {
      const observedEpoch = epoch
      let entry = tokens.get(token)
      if (entry) entry.count++
      else {
        const listener = (): void => {
          if (observedEpoch !== epoch) return
          tokens.delete(token)
          reveal()
        }
        entry = { count: 1, listener }
        tokens.set(token, entry)
        token.listeners.add(listener)
      }
      if (visible && !transitioning && !ordinaryScheduled) {
        ordinaryScheduled = true
        queueMicrotask(() => {
          ordinaryScheduled = false
          if (disposed || !visible || transitioning || tokens.size === 0) return
          content?.dispose()
          content = null
          visible = false
          epoch++
          clearTokens()
          fallback = runWithOwner(owner, () =>
            host.stage(() => props.fallback as Child, parent),
          )
          fallback.commit(marker)
          content = runWithOwner(owner, () =>
            host.stage(
              () =>
                boundaryContext.Provider({
                  value: boundary,
                  children: props.children,
                }) as Child,
              parent,
            ),
          )
          queueMicrotask(reveal)
        })
      }
      return () => {
        if (observedEpoch !== epoch) return
        const current = tokens.get(token)
        if (!current || --current.count !== 0) return
        token.listeners.delete(current.listener)
        tokens.delete(token)
        queueMicrotask(reveal)
      }
    },
    begin() {
      if (!visible || !content) return
      candidate?.dispose()
      candidate = null
      done?.()
      done = null
      epoch++
      clearTokens()
      transitioning = true
      setInternalOwnerGate(content.owner, 2)
    },
    abort() {
      candidate?.dispose()
      candidate = null
      transitioning = false
      if (content) setInternalOwnerGate(content.owner, 0)
      done?.()
      done = null
    },
    finish() {
      if (!visible || !content) return Promise.resolve()
      if (!hasInternalGatedRender(content.owner)) {
        setInternalOwnerGate(content.owner, 0)
        transitioning = false
        return Promise.resolve()
      }
      try {
        candidate = runWithOwner(owner, () =>
          host.stage(
            () =>
              boundaryContext.Provider({
                value: boundary,
                children: props.children,
              }) as Child,
            parent,
          ),
        )
      } catch (error) {
        boundary.abort()
        return Promise.reject(error)
      }
      return new Promise<void>((resolve) => {
        done = resolve
        queueMicrotask(() => {
          if (disposed || !candidate || tokens.size) return
          candidate.dispose()
          candidate = null
          if (content) setInternalOwnerGate(content.owner, 0)
          transitioning = false
          done?.()
          done = null
        })
      })
    },
  }
  controllers.add(boundary)
  onCleanup(() => {
    disposed = true
    controllers.delete(boundary)
    clearTokens()
    done?.()
    done = null
    candidate?.dispose()
    content?.dispose()
    fallback?.dispose()
    host.remove(marker)
  })
  fallback = host.stage(() => props.fallback as Child, parent)
  fallback.commit(marker)
  content = host.stage(
    () =>
      boundaryContext.Provider({
        value: boundary,
        children: props.children,
      }) as Child,
    parent,
  )
  queueMicrotask(reveal)
  return [marker]
})

export function startTransition(fn: () => void): Promise<void> {
  const targets = [...controllers].filter((boundary) => !boundary.parent)
  for (const boundary of targets) boundary.begin()
  try {
    fn()
  } catch (error) {
    for (const boundary of targets) boundary.abort()
    throw error
  }
  return Promise.all(targets.map((boundary) => boundary.finish())).then(
    () => undefined,
  )
}
