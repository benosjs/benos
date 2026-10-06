# Tooltip

`Tooltip` adds brief supplemental information on hover or keyboard focus.

**API:** `label`, `trigger`, and `children` are required. `open`/`onOpenChange`,
`defaultOpen`, `disabled`, `interactive`, `positioning`, `openDelay`,
`closeDelay`, `dir`, `id`, and `ref` are supported.

**Variants:** there are no visual variants; `disabled` controls availability
and positioning options control placement.

```tsx
import { Tooltip } from '@/components/ui/tooltip'

export function HelpHint() {
  return (
    <Tooltip label="About your display name" trigger="Display name">
      This appears on your profile.
    </Tooltip>
  )
}
```

**Accessibility:** the trigger is a focusable button and the tooltip appears
on focus as well as hover. Keep essential instructions visible outside the
tooltip; it is supplemental and does not take focus.
