import { connect, machine } from '@zag-js/select'
import type { Props as ZagSelectProps } from '@zag-js/select'
import { createMachineController } from './adapter.js'
import { normalizeProps } from './normalize.js'

export type SelectOptions = Omit<ZagSelectProps, 'id'> & { id?: string }

export function createSelect(
  getProps: () => SelectOptions,
  getDirectionElement?: () => unknown,
) {
  return createMachineController(
    machine,
    getProps,
    (service) => connect(service, normalizeProps),
    getDirectionElement,
  )
}
