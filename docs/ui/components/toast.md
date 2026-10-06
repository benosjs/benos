# Toast

`Toast` announces a temporary status message in a polite live region.

**API:** `title` is recommended; `description`, `type` (`info`, `success`,
`warning`, or `error`), `duration`, `removeDelay`, `closable`, `action`,
`closeLabel`, `dir`, `id`, and `ref` are supported.

**Variants:** `info`, `success`, `warning`, and `error` set the toast status
tone.

```tsx
import { Toast } from '@/components/ui/toast'

export function SavedNotice() {
  return (
    <Toast
      type="success"
      title="Changes saved"
      description="Your preferences were updated."
      duration={Infinity}
    />
  )
}
```

**Accessibility:** the live region announces the message without moving focus.
Keep the title concise and make any action a reachable native button.
