# create-benos

![Benos logo](https://raw.githubusercontent.com/benosjs/benos/main/assets/brand/benos-mark-navy.png)

Scaffold a TypeScript/TSX Benos application with Vite, Vitest, ESLint,
Prettier, a light/dark responsive layout, a run-once component counter, and a
keyed `<For>` list. The CLI ships one curated starter template. UI setup is
optional and defaults to no.

```sh
npm create benos@latest my-app
```

The folder keeps the name you enter, while the generated `package.json` uses a
valid npm name. For example, `Benos-ui-test` creates that folder with package
name `benos-ui-test`. Generated apps start at version `0.0.0`.

Pass `--ui` to initialize Benos UI and add Button and Input. In an interactive
terminal, the CLI asks “Add Benos UI components?” and defaults to no. Use
`--no-ui` to skip the question explicitly. `--registry <url>` selects a
registry for the optional UI setup.

```sh
npm create benos@latest my-app -- --ui
```

The CLI detects npm, pnpm, Yarn, and Bun. UI setup installs project dependencies,
runs `benos init`, adds Button and Input, and updates the starter to use them.
When launched in a terminal without a directory argument, the CLI asks for a
project name (default `benos-app`), asks about UI components, then asks whether
to install with the detected package manager and start the server. The start
prompt defaults to yes; the local URL is printed by Vite. Declining it prints
the exact next commands. If install fails, the project files remain and the
error output includes manual recovery commands.
If UI was selected but installation was declined, the next steps include
installing dependencies, running `benos init`, adding Button and Input, and
starting the app in that order.

For scripts, `--ui`/`--no-ui`, `--install`/`--no-install`, and
`--start`/`--no-start` control every choice. Without a TTY, create-benos never
prompts and never starts a server unless `--start` is explicit. `--yes` accepts
interactive defaults and confirms a non-empty directory; use `--no-start` when
you want `--yes` without keeping a server running. `--git` initializes Git
only when explicitly passed. Supplying either install/start flag skips that
combined prompt; if `--start` is omitted, the server stays stopped. ESLint is
included as the linter.

Pass `--verbose` to show the detailed files written during `benos init` and
`benos add`; by default, create-benos shows concise progress steps.

MIT licensed. See [LICENSE](LICENSE).
