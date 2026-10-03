import { connect, machine } from '@zag-js/checkbox'
import type { Props as ZagCheckboxProps } from '@zag-js/checkbox'
import { createMachineController } from './adapter.js'
import { normalizeProps } from './normalize.js'

export type CheckboxOptions = Omit<ZagCheckboxProps, 'id'> & { id?: string }

export function createCheckbox(getProps: () => CheckboxOptions) {
  return createMachineController(machine, getProps, (service) =>
    connect(service, normalizeProps),
  )
}
