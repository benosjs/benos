# Draft upstream report: Select prevents Tab from leaving the popup

**Target:** `chakra-ui/zag`, `@zag-js/select` 1.44.0

**Status:** Draft for the maintainer; not filed.

## Summary

With a select-only combobox open and DOM focus on its listbox, pressing Tab is prevented when that listbox is the only tabbable element inside the popup. The popup remains open and focus remains on it. There is no documented `closeOnTab` option or integration hook in 1.44.0; `closeOnSelect` only applies to selecting an item.

## Minimal reproduction

Use `@zag-js/select` 1.44.0 with a collection containing two values, a normal trigger, `getContentProps()`/`getListProps()`, and a focusable button immediately after the widget:

```tsx
<button {...api.getTriggerProps()}>Choose a value</button>
<div {...api.getPositionerProps()}>
  <div {...api.getContentProps()}>
    {items.map((item) => (
      <div {...api.getItemProps({ item })}>{item.label}</div>
    ))}
  </div>
</div>
<button id="after">After select</button>
```

1. Focus the trigger and press ArrowDown to open the popup and focus its listbox.
2. Press Tab.
3. Observe that the listbox remains open and focused; the following button does not receive focus and the highlighted value is not committed.

The same outcome is covered by Benos's `select: APG keyboard interaction` browser fixture in Chromium, Firefox, and WebKit.

## Expected behavior

The WAI-ARIA APG [Select-Only Combobox Example](https://www.w3.org/WAI/ARIA/apg/patterns/combobox/examples/combobox-select-only/) specifies that Tab commits the visually focused option, closes the listbox, and performs the browser's default action to move focus to the next focusable element. This differs from native `<select>` behavior, which the APG explicitly calls out.

## Observed implementation detail

In `select.connect`, `getContentProps().onKeyDown` calls `isValidTabEvent(event)` and calls `preventDefault()` when it returns false. For the focused, sole tabbable listbox/content boundary this blocks browser Tab navigation and returns before the normal key handling. The props API exposes `closeOnSelect`, but no Tab-specific option.

Could the Select connector handle Tab by committing the highlighted item, closing the popup, and allowing the native focus traversal, or expose a documented supported hook for this behavior?
