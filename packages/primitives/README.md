# @benosjs/primitives

![Benos logo](https://raw.githubusercontent.com/benosjs/benos/main/assets/brand/benos-mark-navy.png)

Optional, unstyled adapters for Zag.js machines. Import only the machine
subpath you use; the package root exports a type-only `PrimitiveController`.
Install the adapters, Benos core, and the matching optional Zag machine package;
for example, `npm install @benosjs/primitives @benosjs/core @zag-js/checkbox`.

```tsx
import { createCheckbox } from '@benosjs/primitives/checkbox'

function Checkbox(props: { id?: string }) {
  const checkbox = createCheckbox(() => ({ id: props.id }))
  return (
    <label {...checkbox.api().getRootProps()}>
      <input {...checkbox.api().getHiddenInputProps()} />
      <span {...checkbox.api().getControlProps()} />
      <span {...checkbox.api().getLabelProps()}>Accept terms</span>
    </label>
  )
}
```

`id` is optional. When omitted, the adapter calls `createUniqueId()` from the
active Benos owner; an explicit ID is forwarded to Zag. Controllers subscribe
to machine changes and stop with their component owner. `createToast` also
requires the public Zag toast-group service as its `parent` option.

Available subpaths: `accordion`, `checkbox`, `dialog`, `menu`, `popover`,
`radio-group`, `select`, `switch`, `tabs`, `toast`, and `tooltip`.

See the [UI primitives design](https://github.com/benosjs/benos/blob/main/docs/architecture/ui-primitives.md)
and [API reference](https://github.com/benosjs/benos/blob/main/docs/api-reference.md).
