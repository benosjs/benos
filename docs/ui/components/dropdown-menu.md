# DropdownMenu

`DropdownMenu` opens an action menu from a styled Button trigger.

**API:** provide `label`, `trigger`, and `items` (`value`, `label`, optional
`disabled`). `triggerVariant`, `triggerSize`, `triggerClass`, `open`,
`defaultOpen`, `closeOnSelect`, `loopFocus`, `typeahead`, `positioning`,
`onOpenChange`, `onSelect`, `dir`, `id`, and `ref` are supported.

**Variants:** trigger appearance accepts Button variants and sizes; items can
be enabled or disabled.

```tsx
import { DropdownMenu } from '@/components/ui/dropdown-menu'

export function FileActions() {
  return (
    <DropdownMenu
      label="File actions"
      trigger="Actions"
      items={[
        { value: 'rename', label: 'Rename' },
        { value: 'archive', label: 'Archive' },
      ]}
    />
  )
}
```

**Accessibility:** the menu supports arrow keys, Home/End, Escape, and
typeahead. With Zag 1.44.0, Tab currently stays inside in the tested final-item
case; see the [upstream report](../../upstream/zag-menu-tab.md). Benos does not
intercept Tab locally. Use the render-callback trigger when supplying a custom
Button and spread every provided trigger prop onto it.
