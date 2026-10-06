import { connect, machine } from '@zag-js/toast'
import type { Props as ZagToastProps } from '@zag-js/toast'
import { createMachineController } from './adapter.js'
import { normalizeProps } from './normalize.js'

export type ToastOptions<Content = unknown> = Omit<
  ZagToastProps<Content>,
  'id' | 'meta'
> & { id?: string; meta?: Record<string, unknown> }

export function createToast<Content = unknown>(
  getProps: () => ToastOptions<Content>,
  getDirectionElement?: () => unknown,
) {
  return createMachineController(
    machine,
    getProps,
    (service) => connect(service, normalizeProps),
    getDirectionElement,
  )
}
