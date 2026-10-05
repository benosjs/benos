# Card

`Card` is a presentational `<div>` with no implicit interactive semantics.

**API:** `variant` is `default` (default), `outlined`, or `raised`. Standard
div attributes, `class`, `id`, and a callback `ref` are supported.

**Variants:** `default`, `outlined`, and `raised`.

```tsx
import { Card } from '@/components/ui/card'

export function ProfileCard() {
  return (
    <Card variant="raised">
      <h2>Profile</h2>
      <p>Account settings</p>
    </Card>
  )
}
```

**Accessibility:** choose heading levels that fit the page outline. If a card
contains actions, keep those actions as separate native controls rather than
making the entire card a clickable div.
