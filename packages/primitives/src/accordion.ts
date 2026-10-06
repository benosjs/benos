import { connect, machine } from '@zag-js/accordion'
import type { Props as ZagAccordionProps } from '@zag-js/accordion'
import { createMachineController } from './adapter.js'
import { normalizeProps } from './normalize.js'

export type AccordionOptions = Omit<ZagAccordionProps, 'id'> & { id?: string }

export function createAccordion(
  getProps: () => AccordionOptions,
  getDirectionElement?: () => unknown,
) {
  return createMachineController(
    machine,
    getProps,
    (service) => connect(service, normalizeProps),
    getDirectionElement,
  )
}
