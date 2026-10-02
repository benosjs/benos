import '@benosjs/core'

interface InternalRegistry {
  createInternalOwner: (
    kind: 'root' | 'component' | 'branch' | 'effect-run' | 'boundary',
    mountReady?: () => boolean,
  ) => unknown
  createRenderEffect: (fn: () => void) => () => void
  disposeInternalOwner: (owner: unknown) => void
  getInternalProviderOwner: (value: unknown) => unknown
  hasPendingMounts: (owner: unknown) => boolean
  notifyMount: (owner: unknown) => void
  reportInternalError: (error: unknown) => void
  runWithOwner: <T>(owner: unknown, fn: () => T) => T
  setInternalErrorHandler: (
    owner: unknown,
    handler: (error: unknown) => void,
  ) => void
}

const registry = (
  globalThis as typeof globalThis & { __benosCoreInternal?: InternalRegistry }
).__benosCoreInternal
if (!registry) throw new Error('Benos core internal registry is unavailable')

export type InternalOwner = object

export const createInternalOwner = registry.createInternalOwner as (
  kind: 'root' | 'component' | 'branch' | 'effect-run' | 'boundary',
  mountReady?: () => boolean,
) => InternalOwner
export const createRenderEffect = registry.createRenderEffect
export const disposeInternalOwner = registry.disposeInternalOwner
export const getInternalProviderOwner = registry.getInternalProviderOwner as (
  value: unknown,
) => InternalOwner | null
export const hasPendingMounts = registry.hasPendingMounts
export const notifyMount = registry.notifyMount
export const reportInternalError = registry.reportInternalError
export const runWithOwner = registry.runWithOwner
export const setInternalErrorHandler = registry.setInternalErrorHandler
