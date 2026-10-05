# Benos UI guide

Benos UI is an optional source registry. `benos add` copies editable TSX and
CSS into your application; components do not add a runtime cost until you add
them. This guide covers the install/update workflow and the full 19-component
catalog.

## Installation

Add the CLI as a development dependency with your package manager:

```sh
npm install --save-dev benos
```

Then initialize the token stylesheet and configuration, and add the components
you need:

```sh
npx benos init
npx benos add button input dialog
```

The CLI asks before writing. In CI or scripts, pass `--yes` after reviewing the
plan. The official starter configures the `@/` alias in Vite and TypeScript.
`benos init` records the alias in `benos.json`, writes the tokens to
`src/styles/benos.css`, and adds `.benos/` to `.gitignore`. It verifies an
existing Vite config and never edits it; if an alias is missing, it prints the
exact lines to add and stops. Commit `benos.lock.json`; it pins each
component's immutable source version and is
required for reliable diffs and updates.

New Benos projects can request the same setup during scaffolding:

```sh
npm create benos@latest my-app -- --ui
```

Interactive scaffolding asks for a project name when one is omitted (default
`benos-app`), then asks “Add Benos UI components?” (default no). It next asks
“Install with <detected package manager> and start now?” (default yes). If
accepted, it installs dependencies, runs `benos init` and adds Button and
Input when UI was selected, then starts Vite and prints its local URL. If
declined, it prints the exact commands to run later. Failed installs leave the
generated files in place and print the failed command plus recovery steps.
If UI was selected but installation was declined, the printed commands also
run `benos init` and add Button and Input after dependencies are installed.

Use `--ui` or `--no-ui`, `--install` or `--no-install`, and `--start` or
`--no-start` to control those prompts in scripts. `--yes` accepts prompt
defaults and confirms a non-empty destination; `--git` opts into `git init`.
Supplying either install/start flag skips that combined prompt; an omitted
`--start` then means leave the server stopped, while `--start` installs first
unless paired with `--no-install` (which is an error).
Without a terminal, the CLI never prompts or starts a server automatically;
pass `--start` to request startup explicitly. ESLint remains the starter's
linter. A custom registry can be selected with `--registry <url>`.

## Theme and customization

Import the token stylesheet once from your application entry point:

```tsx
import '../styles/benos.css'
```

Tokens provide light/dark surfaces and text, spacing, radii, typography,
shadows, focus rings, and motion. The default palette follows the Benos navy
mark. The stylesheet follows `prefers-color-scheme`; an app can set
`data-theme="light"` or `data-theme="dark"` on a parent to override it.

Color tokens use the `--benos-color-*` prefix; spacing and radius use
`--benos-space-*` and `--benos-radius-*`. Typography uses `--benos-font-*`,
`--benos-text-*`, and `--benos-line-height-*`; elevation and motion use
`--benos-shadow-*`, `--benos-motion-*`, and `--benos-ease-*`. Overlay stacking
uses `--benos-z-*`. The complete palette and mode precedence are in
[the theming design](../architecture/ui-theming.md).

Override tokens in your own stylesheet after importing the shared token file.
Keep color, direction, and alignment overrides logical so they work in RTL:

```css
[data-theme='dark'] {
  --benos-color-surface: #17243a;
  --benos-color-text: #f2f6fc;
}

.profile-card {
  padding-inline: 1.25rem;
  text-align: start;
}
```

Each copied component has a local class prefix such as `.benos-button` and a
small companion stylesheet. Edit those copied files directly to change markup
or behavior; edit CSS variables first for app-wide visual changes. Avoid
editing files under `.benos/cache/`.

## Inspecting and updating copied components

`benos diff` is read-only and reports every installed file as unchanged, local
edits only, upstream changes only, both changed, missing locally, or new
upstream files. Use it before updating:

```sh
npx benos diff
npx benos update button
```

The update uses the exact base pinned by `benos.lock.json`, merges disjoint
line edits, preserves the file's existing line endings, and updates each
component and its lock entry as one recoverable transaction. Review and commit
the lock file with the source changes.

If edits overlap, Benos leaves that component and lock entry untouched and
writes `.base`, `.local`, and `.incoming` copies under `.benos/conflicts/` with
resolution instructions. For a file that exists in the incoming version, save
the desired local resolution, temporarily make the conflicted source match the
incoming copy exactly, then rerun `benos update <component>` so the lock can
advance. Reapply your saved local changes on the now-current source and review
the result. The `.local` artifact preserves the pre-update edit. Never place
conflict markers in application source.

If the pinned base cannot be downloaded and no valid cache copy exists, update
refuses to merge and leaves source and lock data alone. A deleted local file or
a file removed upstream is treated as a conflict. The current CLI has no guided
acceptance command for upstream file removal; keep the component as-is and
resolve that registry change manually rather than editing the lock casually.

Registry items declare minimum installed versions of `@benosjs/*` packages. If
your installed version is too old, `benos add` or `benos update` stops before
writing and prints the exact package-manager command to upgrade. Run that
command, then retry. A package version declared in `package.json` is not enough;
the required version must be installed in `node_modules`.

## Component catalog

Every page documents the current public props, variants, and accessibility
behavior. Examples use the conventional `@/components/ui/` path; the guide
checker compiles each JSX example and runs TypeScript strict checking in CI.

### Foundations

- [Button](components/button.md)
- [Input](components/input.md)
- [Textarea](components/textarea.md)
- [Label](components/label.md)
- [Card](components/card.md)
- [Badge](components/badge.md)
- [Separator](components/separator.md)

### Inputs and navigation

- [Checkbox](components/checkbox.md)
- [Switch](components/switch.md)
- [RadioGroup](components/radio-group.md)
- [Select](components/select.md)
- [Tabs](components/tabs.md)
- [Accordion](components/accordion.md)

### Overlays and data

- [Dialog](components/dialog.md)
- [Popover](components/popover.md)
- [Tooltip](components/tooltip.md)
- [DropdownMenu](components/dropdown-menu.md)
- [Toast](components/toast.md)
- [SortableTable](components/sortable-table.md)
