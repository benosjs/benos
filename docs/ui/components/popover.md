# Popover

`Popover` displays non-modal supplemental content from a styled Button trigger.

**API:** `label`, `trigger`, and `children` are required. `triggerVariant`,
`triggerSize`, `triggerClass`, `open`/`onOpenChange`, `defaultOpen`, `modal`,
`autoFocus`, `closeOnInteractOutside`, `positioning`, `closeLabel`, `dir`,
`id`, and `ref` are supported.

**Variants:** trigger appearance accepts Button variants and sizes; content is
non-modal by default.

```tsx
import { Popover } from '@/components/ui/popover'

export function MoreDetails() {
  return (
    <Popover label="Plan details" trigger="More details">
      <p>Includes team sharing and history.</p>
    </Popover>
  )
}
```

**Accessibility:** the trigger receives expanded/controls state and the popup
has its accessible label. Escape closes it and focus returns appropriately;
positioning flips and shifts near viewport edges.
