# Accordion

`Accordion` shows and hides sections of related content.

**API:** each item requires `value`, `title`, and `content`, with optional
`disabled`. `value`/`onValueChange` or `defaultValue` controls expanded items.
`multiple`, `collapsible`, `orientation`, `dir`, `disabled`, `id`, and `ref`
are supported.

**Variants:** there are no appearance variants; `orientation` controls layout,
and `multiple`/`collapsible` control expansion behavior.

```tsx
import { Accordion } from '@/components/ui/accordion'

export function HelpSections() {
  return (
    <Accordion
      defaultValue={['delivery']}
      items={[
        {
          value: 'delivery',
          title: 'Delivery',
          content: 'Most orders arrive within two days.',
        },
      ]}
    />
  )
}
```

**Accessibility:** triggers are buttons with expanded state and panel
relationships. Arrow keys move between triggers; Enter/Space toggles a panel.
The expanded indicator tracks the current state.
