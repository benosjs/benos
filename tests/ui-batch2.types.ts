import { expectTypeOf } from 'expect-type'
import type { JSX } from '@benosjs/dom'
import type {
  AccordionItem,
  AccordionProps,
} from '../registry/source/components/accordion.js'
import type { CheckboxProps } from '../registry/source/components/checkbox.js'
import type {
  RadioGroupItem,
  RadioGroupProps,
} from '../registry/source/components/radio-group.js'
import type {
  SelectItem,
  SelectProps,
} from '../registry/source/components/select.js'
import type { SwitchProps } from '../registry/source/components/switch.js'
import type { TabsItem, TabsProps } from '../registry/source/components/tabs.js'
import { Accordion } from '../registry/source/components/accordion.js'
import { Checkbox } from '../registry/source/components/checkbox.js'
import { RadioGroup } from '../registry/source/components/radio-group.js'
import { Select } from '../registry/source/components/select.js'
import { Switch } from '../registry/source/components/switch.js'
import { Tabs } from '../registry/source/components/tabs.js'

expectTypeOf<CheckboxProps['id']>().toEqualTypeOf<string | undefined>()
expectTypeOf<CheckboxProps['checked']>().toEqualTypeOf<
  boolean | 'indeterminate' | undefined
>()
expectTypeOf<CheckboxProps['ref']>().toEqualTypeOf<
  ((element: HTMLLabelElement) => void) | undefined
>()
expectTypeOf<SwitchProps['id']>().toEqualTypeOf<string | undefined>()
expectTypeOf<SwitchProps['checked']>().toEqualTypeOf<boolean | undefined>()
expectTypeOf<SwitchProps['ref']>().toEqualTypeOf<
  ((element: HTMLLabelElement) => void) | undefined
>()
expectTypeOf<RadioGroupProps['items']>().toEqualTypeOf<
  readonly RadioGroupItem[]
>()
expectTypeOf<RadioGroupProps['id']>().toEqualTypeOf<string | undefined>()
expectTypeOf<RadioGroupProps['ref']>().toEqualTypeOf<
  ((element: HTMLDivElement) => void) | undefined
>()
expectTypeOf<SelectProps['items']>().toEqualTypeOf<readonly SelectItem[]>()
expectTypeOf<SelectProps['id']>().toEqualTypeOf<string | undefined>()
expectTypeOf<SelectProps['ref']>().toEqualTypeOf<
  ((element: HTMLDivElement) => void) | undefined
>()
expectTypeOf<TabsProps['items']>().toEqualTypeOf<readonly TabsItem[]>()
expectTypeOf<TabsProps['id']>().toEqualTypeOf<string | undefined>()
expectTypeOf<AccordionProps['items']>().toEqualTypeOf<
  readonly AccordionItem[]
>()
expectTypeOf<AccordionProps['id']>().toEqualTypeOf<string | undefined>()

expectTypeOf<typeof Checkbox>().toEqualTypeOf<
  (props: CheckboxProps) => JSX.Element
>()
expectTypeOf<typeof Switch>().toEqualTypeOf<
  (props: SwitchProps) => JSX.Element
>()
expectTypeOf<typeof RadioGroup>().toEqualTypeOf<
  (props: RadioGroupProps) => JSX.Element
>()
expectTypeOf<typeof Select>().toEqualTypeOf<
  (props: SelectProps) => JSX.Element
>()
expectTypeOf<typeof Tabs>().toEqualTypeOf<(props: TabsProps) => JSX.Element>()
expectTypeOf<typeof Accordion>().toEqualTypeOf<
  (props: AccordionProps) => JSX.Element
>()

const validCheckbox: CheckboxProps = {
  id: 'terms',
  defaultChecked: false,
  children: 'Accept terms',
  ref: (element) => element.htmlFor,
}
const validSwitch: SwitchProps = { id: 'alerts', checked: true }
const validRadio: RadioGroupProps = {
  label: 'Delivery',
  items: [{ value: 'standard', label: 'Standard' }],
  defaultValue: 'standard',
}
const validSelect: SelectProps = {
  label: 'Region',
  items: [{ value: 'north', label: 'North' }],
  defaultValue: ['north'],
}
const validTabs: TabsProps = {
  label: 'Account',
  items: [{ value: 'profile', label: 'Profile', content: 'Your profile' }],
}
const validAccordion: AccordionProps = {
  items: [{ value: 'shipping', title: 'Shipping', content: 'Two days' }],
}
// @ts-expect-error Checkbox state is boolean or indeterminate.
const invalidCheckbox: CheckboxProps = { checked: 'mixed' }
// @ts-expect-error Radio item values are strings.
const invalidRadio: RadioGroupItem = { value: 1, label: 'Invalid' }
const invalidTab: TabsItem = {
  value: 'settings',
  label: 'Settings',
  // @ts-expect-error Tab content must be a Benos child.
  content: {},
}

void [
  validCheckbox,
  validSwitch,
  validRadio,
  validSelect,
  validTabs,
  validAccordion,
  invalidCheckbox,
  invalidRadio,
  invalidTab,
]
