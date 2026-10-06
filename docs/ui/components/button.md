# Button

`Button` renders a native `<button>` and forwards standard button attributes.

**API:** `variant` is `primary` (default), `secondary`, `outline`, `ghost`, or
`danger`; `size` is `sm`, `md` (default), or `lg`. `class`, `id`, `ref`, and
native button props are supported.

**Variants:** `primary`, `secondary`, `outline`, `ghost`, and `danger`; sizes
are `sm`, `md`, and `lg`.

```tsx
import { Button } from '@/components/ui/button'

export function SaveButton() {
  return (
    <Button variant="secondary" size="md">
      Save draft
    </Button>
  )
}
```

**Accessibility:** use a clear action label, keep the native button `type`
explicit in forms, and retain the visible keyboard focus ring. Disabled buttons
use the native `disabled` attribute.
