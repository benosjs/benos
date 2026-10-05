# Dialog

`Dialog` opens a modal or non-modal overlay from a styled Button trigger.

**API:** `title`, `trigger`, and `children` are required;
`description`, `triggerVariant`, `triggerSize`, `triggerClass`, `open`,
`defaultOpen`, `modal`, `trapFocus`, `preventScroll`, `closeOnEscape`,
`closeOnInteractOutside`, `restoreFocus`, `dir`, `id`, and `ref` are supported.

**Variants:** trigger appearance accepts Button variants and sizes; `modal`
selects modal versus non-modal behavior.

```tsx
import { Dialog } from '@/components/ui/dialog'

export function EditProfile() {
  return (
    <Dialog title="Edit profile" trigger="Edit profile">
      <p>Update your profile details.</p>
    </Dialog>
  )
}
```

**Accessibility:** modal mode traps focus, locks background scrolling, marks
the background inert, closes on Escape by default, and restores focus to the
trigger. Supply a meaningful title and keep the built-in close button.
