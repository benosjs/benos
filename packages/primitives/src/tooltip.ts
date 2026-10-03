import { connect, machine } from '@zag-js/tooltip'
import type { Props as ZagTooltipProps } from '@zag-js/tooltip'
import { createMachineController } from './adapter.js'
import { normalizeProps } from './normalize.js'

export type TooltipOptions = Omit<ZagTooltipProps, 'id'> & { id?: string }

export function createTooltip(getProps: () => TooltipOptions) {
  return createMachineController(machine, getProps, (service) =>
    connect(service, normalizeProps),
  )
}
