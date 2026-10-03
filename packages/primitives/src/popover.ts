import { connect, machine } from '@zag-js/popover'
import type { Props as ZagPopoverProps } from '@zag-js/popover'
import { createMachineController } from './adapter.js'
import { normalizeProps } from './normalize.js'

export type PopoverOptions = Omit<ZagPopoverProps, 'id'> & { id?: string }

export function createPopover(getProps: () => PopoverOptions) {
  return createMachineController(machine, getProps, (service) =>
    connect(service, normalizeProps),
  )
}
