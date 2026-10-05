import { connect, machine } from '@zag-js/switch'
import type { Props as ZagSwitchProps } from '@zag-js/switch'
import { createMachineController } from './adapter.js'
import { normalizeProps } from './normalize.js'

export type SwitchOptions = Omit<ZagSwitchProps, 'id'> & { id?: string }

export function createSwitch(
  getProps: () => SwitchOptions,
  getDirectionElement?: () => unknown,
) {
  return createMachineController(
    machine,
    getProps,
    (service) => connect(service, normalizeProps),
    getDirectionElement,
  )
}
