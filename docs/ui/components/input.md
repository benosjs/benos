# Input

`Input` styles a native text input and accepts its standard input attributes.

**API:** `size` is `sm`, `md` (default), or `lg`; `type` supports email,
number, password, search, tel, text, and url. Set `invalid` or
`aria-invalid`, and pass `ref` for the concrete input element.

**Variants:** sizes are `sm`, `md`, and `lg`; `type` selects native input
behavior.

```tsx
import { Input } from '@/components/ui/input'

export function EmailField() {
  return (
    <Input
      type="email"
      aria-label="Email address"
      placeholder="you@example.com"
    />
  )
}
```

**Accessibility:** give every input a visible `<Label>` or an accessible name.
Associate help and error text with `aria-describedby`; use `invalid` together
with a visible error message.
