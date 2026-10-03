import { connect, machine } from '@zag-js/dialog'
import type { Props as ZagDialogProps } from '@zag-js/dialog'
import { createMachineController } from './adapter.js'
import { normalizeProps } from './normalize.js'

export type DialogOptions = Omit<ZagDialogProps, 'id'> & { id?: string }

export function createDialog(getProps: () => DialogOptions) {
  return createMachineController(machine, getProps, (service) =>
    connect(service, normalizeProps),
  )
}
