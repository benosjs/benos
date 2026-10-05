# RadioGroup

`RadioGroup` presents mutually exclusive choices using native radio inputs.

**API:** provide `label` and `items` (`value`, `label`, optional `disabled`).
`value`/`onValueChange` control the selection; `defaultValue` sets the initial
selection. `orientation`, `dir`, `disabled`, `required`, `readOnly`, `invalid`,
`name`, `form`, `id`, and `ref` are supported.

**Variants:** there are no appearance variants; `orientation` controls layout.

```tsx
import { RadioGroup } from '@/components/ui/radio-group'

export function DeliveryChoice() {
  return (
    <RadioGroup
      label="Delivery"
      defaultValue="standard"
      items={[
        { value: 'standard', label: 'Standard' },
        { value: 'express', label: 'Express' },
      ]}
    />
  )
}
```

**Accessibility:** native radios provide arrow-key selection and a single
Tab stop. In WebKit, native RTL radio ArrowLeft behavior differs from
Chromium/Firefox: WebKit may retain the current choice. This is browser-native
behavior documented in the [U4 findings](../../architecture/ui-primitives.md).
