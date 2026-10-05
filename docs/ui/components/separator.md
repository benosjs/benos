# Separator

`Separator` indicates a visual or semantic division between nearby content.

**API:** `orientation` is `horizontal` (default) or `vertical`; `decorative`
selects whether assistive technology treats it as meaningful. Standard div
attributes, `class`, `id`, and callback `ref` are supported.

**Variants:** `orientation` selects horizontal or vertical presentation;
there are no color or tone variants.

```tsx
import { Separator } from '@/components/ui/separator'

export function SectionBreak() {
  return (
    <>
      <p>Account</p>
      <Separator />
      <p>Notifications</p>
    </>
  )
}
```

**Accessibility:** keep decorative separators hidden from the accessibility
tree. Use a labelled semantic heading when the division introduces a new
section.
