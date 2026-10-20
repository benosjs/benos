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

This package is in progress for 0.5.0: the form core is implemented;
Standard Schema validation, `<form.Field>`, and the navigation leave policy
follow. The design is in
[docs/architecture/forms.md](https://github.com/benosjs/benos/blob/main/docs/architecture/forms.md).
