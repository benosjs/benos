# Tabs

`Tabs` switches between labelled panels.

**API:** `label` names the tab set; `items` contain `value`, `label`, and
`content`. `value`/`onValueChange`, `defaultValue`, `orientation`,
`activationMode`, `loopFocus`, `dir`, `id`, and `ref` are supported.

**Variants:** there are no appearance variants; `orientation` changes tab
layout and arrow-key direction.

```tsx
import { Tabs } from '@/components/ui/tabs'

export function AccountTabs() {
  return (
    <Tabs
      label="Account"
      defaultValue="profile"
      items={[
        { value: 'profile', label: 'Profile', content: <p>Profile details</p> },
        {
          value: 'security',
          label: 'Security',
          content: <p>Security options</p>,
        },
      ]}
    />
  )
}
```

**Accessibility:** tab buttons and panels are linked with ARIA IDs. Arrow keys
move among tabs; Enter/Space activates in manual mode. Keep tab labels concise
and panel headings meaningful.
