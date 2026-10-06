# Draft upstream report: Menu prevents Tab from exiting a one-stop menu

**Target:** `chakra-ui/zag`, `@zag-js/menu` 1.44.0

**Status:** Draft for the maintainer; not filed.

## Summary

When a menu opened from a menu button contains only its menu container as a tabbable stop (the usual `aria-activedescendant` pattern), Tab is prevented. The menu remains open and focus stays in the menu instead of moving to the next page control. There is no documented Tab-close option; `closeOnSelect` applies to item selection only.

## Minimal reproduction

Use `@zag-js/menu` 1.44.0 with one or more menu items and a normal focusable button after the popup:

```tsx
<button {...api.getTriggerProps()}>Actions</button>
<div {...api.getPositionerProps()}>
  <div {...api.getContentProps()}>
    <button {...api.getItemProps({ value: 'edit' })}>Edit</button>
  </div>
</div>
<button id="after">After menu</button>
```

1. Focus the trigger and press ArrowDown to open the menu.
2. Press Tab while menu content has focus.
3. Observe that the menu stays open and focus remains on menu content; the following button does not receive focus.

The behavior is covered by Benos's `menu: APG keyboard interaction` browser fixture in Chromium, Firefox, and WebKit.

## Expected behavior

The WAI-ARIA APG [Menu and Menubar Pattern](https://www.w3.org/WAI/ARIA/apg/patterns/menubar/) specifies that Tab or Shift+Tab from a menu item moves focus out of the menu and closes all open menus and submenus.

## Observed implementation detail

In `menu.connect`, `getContentProps().onKeyDown` calls `isValidTabEvent(event)` and calls `preventDefault()` when it returns false. With the normal active-descendant menu, the content container is the only tab stop, so the guard blocks Tab and returns without closing the machine. The `MenuProps` API has no Tab-specific setting.

Could the connector let Tab/Shift+Tab leave the menu and close it, or document a supported integration hook for this APG behavior?
