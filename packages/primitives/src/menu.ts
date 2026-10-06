import { connect, machine } from '@zag-js/menu'
import type { Props as ZagMenuProps } from '@zag-js/menu'
import { createMachineController } from './adapter.js'
import { normalizeProps } from './normalize.js'

export type MenuOptions = Omit<ZagMenuProps, 'id'> & { id?: string }

export function createMenu(
  getProps: () => MenuOptions,
  getDirectionElement?: () => unknown,
) {
  return createMachineController(
    machine,
    getProps,
    (service) => connect(service, normalizeProps),
    getDirectionElement,
  )
}
