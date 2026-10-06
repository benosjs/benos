# Label

`Label` renders a native label with Benos typography and spacing.

**API:** standard label attributes are supported, along with `class`, `id`, and
a callback `ref`. Use `for` with the matching control `id`.

**Variants:** there are no built-in visual variants; use `class` or token
overrides to customize the label.

```tsx
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

export function NameField() {
  return (
    <div>
      <Label for="display-name">Display name</Label>
      <Input id="display-name" />
    </div>
  )
}
```

**Accessibility:** clicking the label focuses its associated control. Benos
uses `for`; `htmlFor` is rejected with a development diagnostic.
