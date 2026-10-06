# benos

![Benos logo](https://raw.githubusercontent.com/benosjs/benos/main/assets/brand/benos-mark-navy.png)

The `benos` CLI initializes a Benos UI workspace, copies components from the
static registry, and lists available or installed items.

Install it as a development tool in a Benos app:

```sh
npm install --save-dev benos
```

```sh
npx benos init
npx benos add button
npx benos list
npx benos diff button
npx benos update button
```

`init` checks the existing Vite and TypeScript `@/` aliases before writing and
never edits Vite configuration. `add` copies source into your project so you
can change it. Registry cache and conflict artifacts live in `.benos/`;
commit `benos.lock.json` with your application.

See the [UI CLI design](https://github.com/benosjs/benos/blob/main/docs/architecture/ui-cli.md)
and [registry design](https://github.com/benosjs/benos/blob/main/docs/architecture/ui-registry.md).
