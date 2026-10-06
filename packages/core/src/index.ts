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
  | 'notifyMount'
  | 'reportInternalError'
  | 'runWithOwner'
  | 'setInternalErrorHandler'
>
;(
  globalThis as typeof globalThis & { __benosCoreInternal?: InternalRegistry }
).__benosCoreInternal = {
  createInternalOwner: runtime.createInternalOwner,
  createRenderEffect: runtime.createRenderEffect,
  disposeInternalOwner: runtime.disposeInternalOwner,
  getInternalProviderOwner: runtime.getInternalProviderOwner,
  hasPendingMounts: runtime.hasPendingMounts,
  notifyMount: runtime.notifyMount,
  reportInternalError: runtime.reportInternalError,
  runWithOwner: runtime.runWithOwner,
  setInternalErrorHandler: runtime.setInternalErrorHandler,
}
