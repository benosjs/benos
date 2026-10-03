import { connect, machine } from '@zag-js/radio-group'
import type { Props as ZagRadioGroupProps } from '@zag-js/radio-group'
import { createMachineController } from './adapter.js'
import { normalizeProps } from './normalize.js'

export type RadioGroupOptions = Omit<ZagRadioGroupProps, 'id'> & {
  id?: string
}

export function createRadioGroup(getProps: () => RadioGroupOptions) {
  return createMachineController(machine, getProps, (service) =>
    connect(service, normalizeProps),
  )
}
