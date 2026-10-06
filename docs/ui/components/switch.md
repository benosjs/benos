# Switch

`Switch` controls a persistent on/off setting and exposes `role="switch"`.

**API:** `checked` plus `onCheckedChange` controls state; `defaultChecked`
sets an initial state. It also accepts `disabled`, `required`, `readOnly`,
`invalid`, `name`, `form`, `value`, `dir`, optional `label`, `id`, and `ref`.

**Variants:** there are no appearance variants; `checked`, `disabled`, and
`invalid` describe switch state.

```tsx
import { Switch } from '@/components/ui/switch'

export function NotificationsSetting() {
  return <Switch defaultChecked>Enable notifications</Switch>
}
```

**Accessibility:** keep a stable accessible name while its state changes. The
native control supports Space; assistive technology announces the switch role
and checked state.
