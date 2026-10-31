import '@benosjs/core'

/** Per-root record set by a server or hydrating renderer; see ssr.md. */
export interface InternalRequest {
  id: string
  mode: 'server' | 'hydrate'
  resources: Map<string, unknown>
  queries: Map<string, unknown>
  signal?: AbortSignal
  /** `shell` marks work the streamed shell waits for (the router's navigation). */
  track?: (promise: Promise<unknown>, shell?: boolean) => void
  onError?: (error: unknown, info: { phase: 'setup' | 'data' }) => void
  response?: { status: number; headers: Headers }
  /** Registers work to run when the request root is disposed. */
  cleanup?: (fn: () => void) => void
  /** Server: launched, tracked resources still pending (async maintains it). */
  pendingCount?: number
  /** Hydrate: the streamed-boundary ID of a Suspense marker, if its patch is still to come. */
  pendingOf?: (marker: object) => string | undefined
  /** Hydrate: runs `next` when that boundary's patch lands, or at the end of the stream. */
  whenPatched?: (id: string, next: () => void) => void
  /** Hydrate: runs `next` when a snapshot with that key lands, or at the end of the stream. */
  whenSnapshot?: (key: string, next: () => void) => void
}

interface InternalRegistry {
  claimInternalOrdinal: () => number
  createInternalOwner: (
    kind: 'root' | 'component' | 'branch' | 'effect-run' | 'boundary',
    mountReady?: () => boolean,
    key?: string,
    ordinal?: number,
  ) => unknown
  createRenderEffect: (fn: () => void) => () => void
  internalRequest: (request?: InternalRequest) => InternalRequest | undefined
  disposeInternalOwner: (owner: unknown) => void
  getInternalProviderOwner: (value: unknown) => unknown
  hasPendingMounts: (owner: unknown) => boolean
  hasInternalGatedRender: (owner: unknown) => boolean
  notifyMount: (owner: unknown) => void
  reportInternalError: (error: unknown) => void
  runWithOwner: <T>(owner: unknown, fn: () => T) => T
  setInternalErrorHandler: (
    owner: unknown,
    handler: (error: unknown) => void,
  ) => void
  setInternalOwnerGate: (owner: unknown, gate: 0 | 1 | 2) => void
}

const registry = (
  globalThis as typeof globalThis & { __benosCoreInternal?: InternalRegistry }
).__benosCoreInternal
if (!registry) throw new Error('Benos core internal registry is unavailable')

export type InternalOwner = object

export const claimInternalOrdinal = registry.claimInternalOrdinal
export const createInternalOwner = registry.createInternalOwner as (
  kind: 'root' | 'component' | 'branch' | 'effect-run' | 'boundary',
  mountReady?: () => boolean,
  key?: string,
  ordinal?: number,
) => InternalOwner
export const createRenderEffect = registry.createRenderEffect
export const internalRequest = registry.internalRequest
export const disposeInternalOwner = registry.disposeInternalOwner
export const getInternalProviderOwner = registry.getInternalProviderOwner as (
  value: unknown,
) => InternalOwner | null
export const hasPendingMounts = registry.hasPendingMounts
export const hasInternalGatedRender = registry.hasInternalGatedRender
export const notifyMount = registry.notifyMount
export const reportInternalError = registry.reportInternalError
export const runWithOwner = registry.runWithOwner
export const setInternalErrorHandler = registry.setInternalErrorHandler
export const setInternalOwnerGate = registry.setInternalOwnerGate
