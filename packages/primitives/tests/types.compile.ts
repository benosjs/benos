import { createAccordion } from '@benosjs/primitives/accordion'
import { createCheckbox } from '@benosjs/primitives/checkbox'
import { createDialog } from '@benosjs/primitives/dialog'
import { createMenu } from '@benosjs/primitives/menu'
import { createPopover } from '@benosjs/primitives/popover'
import { createRadioGroup } from '@benosjs/primitives/radio-group'
import { createSelect } from '@benosjs/primitives/select'
import { createSwitch } from '@benosjs/primitives/switch'
import { createTabs } from '@benosjs/primitives/tabs'
import { createToast } from '@benosjs/primitives/toast'
import { createTooltip } from '@benosjs/primitives/tooltip'

type OptionsOf<Factory> = Factory extends (
  getProps: () => infer Options,
) => unknown
  ? Options
  : never
type IsOptional<T, Key extends keyof T> =
  object extends Pick<T, Key> ? true : false
type Assert<T extends true> = T
type IsAny<T> = 0 extends 1 & T ? true : false
type ReturnState<Factory> =
  ReturnType<
    Factory extends (...args: never[]) => unknown ? Factory : never
  > extends {
    state: () => infer State
  }
    ? State
    : never

type OptionalGeneratedIdOnEveryPrimitive = [
  Assert<IsOptional<OptionsOf<typeof createAccordion>, 'id'>>,
  Assert<IsOptional<OptionsOf<typeof createCheckbox>, 'id'>>,
  Assert<IsOptional<OptionsOf<typeof createDialog>, 'id'>>,
  Assert<IsOptional<OptionsOf<typeof createMenu>, 'id'>>,
  Assert<IsOptional<OptionsOf<typeof createPopover>, 'id'>>,
  Assert<IsOptional<OptionsOf<typeof createRadioGroup>, 'id'>>,
  Assert<IsOptional<OptionsOf<typeof createSelect>, 'id'>>,
  Assert<IsOptional<OptionsOf<typeof createSwitch>, 'id'>>,
  Assert<IsOptional<OptionsOf<typeof createTabs>, 'id'>>,
  Assert<IsOptional<OptionsOf<typeof createToast>, 'id'>>,
  Assert<IsOptional<OptionsOf<typeof createTooltip>, 'id'>>,
]

type PrimitiveStateIsNotAny = Assert<
  IsAny<ReturnState<typeof createCheckbox>> extends false ? true : false
>

export type PrimitiveTypeChecks = [
  OptionalGeneratedIdOnEveryPrimitive,
  PrimitiveStateIsNotAny,
]
