# Textarea

`Textarea` is a styled native multi-line text control.

**API:** `size` is `sm`, `md` (default), or `lg`; native textarea attributes,
`class`, `id`, and a callback `ref` are forwarded.

**Variants:** sizes are `sm`, `md`, and `lg`.

```tsx
import { Textarea } from '@/components/ui/textarea'

export function MessageField() {
  return (
    <Textarea aria-label="Message" rows={4} placeholder="Write a message" />
  )
}
```

**Accessibility:** provide a visible label or `aria-label`. Use
`aria-describedby` for helper and validation text; use `invalid` and show the
reason in text rather than color alone.
