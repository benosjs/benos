# @benosjs/forms

![Benos logo](https://raw.githubusercontent.com/benosjs/benos/main/assets/brand/benos-mark-navy.png)

Forms for Benos. A form model turns server data into an editable copy that
follows its record: it resets when the route commits a different record,
updates fields the user has not touched when the same record is refetched,
never overwrites edits, and saves through a `@benosjs/query` mutation.

```ts
import { formModel } from '@benosjs/forms'

const projectForm = formModel({
  route: projectRoute,
  schema: editSchema,
  from: (project: Project): EditProject => ({
    name: project.name,
    ownerEmail: project.ownerEmail,
  }),
  save: saveProject,
})
```

Fields render with `<form.Field>`, which wires the label, description, and
error to the registry `Input`, `Textarea`, `Checkbox`, `Switch`, `RadioGroup`,
and `Select`. Validation uses any Standard Schema library, such as Zod,
Valibot, or ArkType, and a route-bound form asks before you leave with unsaved
changes.

See the [forms guide](https://github.com/benosjs/benos/blob/main/docs/forms.md)
and the [design](https://github.com/benosjs/benos/blob/main/docs/architecture/forms.md).
