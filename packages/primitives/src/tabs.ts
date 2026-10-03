import { connect, machine } from '@zag-js/tabs'
import type { Props as ZagTabsProps } from '@zag-js/tabs'
import { createMachineController } from './adapter.js'
import { normalizeProps } from './normalize.js'

export type TabsOptions = Omit<ZagTabsProps, 'id'> & { id?: string }

export function createTabs(getProps: () => TabsOptions) {
  return createMachineController(machine, getProps, (service) =>
    connect(service, normalizeProps),
  )
}
