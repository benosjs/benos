# Select

`Select` is a styled, searchable-by-keyboard choice popup with controlled or
uncontrolled selection.

**API:** supply `label` and `items` (`value`, `label`, optional `disabled`).
`value`/`onValueChange`, `defaultValue`, `open`/`onOpenChange`, `defaultOpen`,
`placeholder`, `disabled`, `required`, `readOnly`, `invalid`, `positioning`,
`dir`, `name`, `form`, `id`, and `ref` are supported.

**Variants:** there are no appearance variants; `disabled`, `readOnly`, and
`invalid` control field state.

```tsx
import { Select } from '@/components/ui/select'

export function RegionField() {
  return (
    <Select
      label="Region"
      placeholder="Choose a region"
      items={[
        { value: 'north', label: 'North' },
        { value: 'south', label: 'South' },
      ]}
    />
  )
}
```

**Accessibility:** the trigger exposes a label and selected value; options
support arrow navigation, Home/End, and typeahead. With Zag 1.44.0 the popup
currently stays open on Tab in the tested last-option case. There is no
documented Zag option for closing and moving focus on Tab; see the
[upstream report](../../upstream/zag-select-tab.md). Benos does not intercept
Tab as a workaround.
