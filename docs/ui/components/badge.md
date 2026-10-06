# Badge

`Badge` renders a compact inline status or category label.

**API:** `tone` is `neutral` (default), `brand`, `success`, `warning`, or
`danger`. Span attributes, `class`, `id`, and a callback `ref` are supported.

**Variants:** tones are `neutral`, `brand`, `success`, `warning`, and `danger`.

```tsx
import { Badge } from '@/components/ui/badge'

export function SaveStatus() {
  return <Badge tone="success">Saved</Badge>
}
```

**Accessibility:** write the status in text. Tone is supplementary and does
not replace a readable status label.
