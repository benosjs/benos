export {
  batch,
  computed,
  createContext,
  createRoot,
  createUniqueId,
  effect,
  getContext,
  onCleanup,
  onMount,
  signal,
  untrack,
} from './runtime.js'

export type {
  Context,
  ReadonlySignal,
  Signal,
  SignalOptions,
} from './runtime.js'

import * as runtime from './runtime.js'

type InternalRegistry = Pick<
  typeof runtime,
  | 'createInternalOwner'
  | 'createRenderEffect'
  | 'disposeInternalOwner'
  | 'getInternalProviderOwner'
  | 'hasPendingMounts'
  | 'hasInternalGatedRender'
  | 'notifyMount'
  | 'reportInternalError'
  | 'runWithOwner'
  | 'setInternalErrorHandler'
  | 'setInternalOwnerGate'
>
;(
  globalThis as typeof globalThis & { __benosCoreInternal?: InternalRegistry }
).__benosCoreInternal = {
  createInternalOwner: runtime.createInternalOwner,
  createRenderEffect: runtime.createRenderEffect,
  disposeInternalOwner: runtime.disposeInternalOwner,
  getInternalProviderOwner: runtime.getInternalProviderOwner,
  hasPendingMounts: runtime.hasPendingMounts,
  hasInternalGatedRender: runtime.hasInternalGatedRender,
  notifyMount: runtime.notifyMount,
  reportInternalError: runtime.reportInternalError,
  runWithOwner: runtime.runWithOwner,
  setInternalErrorHandler: runtime.setInternalErrorHandler,
  setInternalOwnerGate: runtime.setInternalOwnerGate,
}
