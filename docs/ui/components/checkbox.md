# Checkbox

`Checkbox` is a labelled native checkbox with controlled and uncontrolled
state.

**API:** use `checked` with `onCheckedChange` for controlled state, or
`defaultChecked` for an initial value. `disabled`, `required`, `readOnly`,
`invalid`, `name`, `form`, `value`, `dir`, `id`, and `ref` are supported.

**Variants:** there are no appearance variants; `checked`, `disabled`, and
`invalid` are state options.

```tsx
import { Checkbox } from '@/components/ui/checkbox'

export function UpdatesPreference() {
  return <Checkbox defaultChecked>Email me product updates</Checkbox>
}
```

**Accessibility:** the label text is part of the clickable label. Preserve
native Space-key toggling, show invalid state with text, and use `required`
only when submission actually requires the choice.
