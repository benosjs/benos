# create-benos

![Benos logo](https://raw.githubusercontent.com/benosjs/benos/main/assets/brand/benos-mark-navy.png)

Scaffold a TypeScript/TSX Benos application with Vite, Vitest, ESLint,
Prettier, a light/dark responsive layout, a run-once component counter, and a
keyed `<For>` list. The CLI ships one curated starter template. UI setup is
optional and defaults to no.

```sh
npm create benos@latest my-app
```

Pass `--ui` to initialize Benos UI and add Button and Input. In an interactive
terminal, the CLI asks “Add Benos UI components?” and defaults to no. Use
`--no-ui` to skip the question explicitly. `--registry <url>` selects a
registry for the optional UI setup.

```sh
npm create benos@latest my-app -- --ui
```

The CLI detects npm, pnpm, Yarn, and Bun. UI setup installs project dependencies,
runs `benos init`, adds Button and Input, and updates the starter to use them.
Start it with the detected package manager's `run dev` command.
Use `--yes` for a confirmed non-interactive overwrite and `--git` when Git
initialization is wanted.

MIT licensed. See [LICENSE](LICENSE).
