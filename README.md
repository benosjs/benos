# Benos

![Benos logo](https://raw.githubusercontent.com/benosjs/benos/main/assets/benos-logo.png)

Benos is a TypeScript-first fine-grained frontend framework. Components run
once, signals update DOM bindings synchronously, and ownership makes effects,
listeners, refs, and cleanup deterministic.

## Create an app

```sh
npm create benos@latest my-app
cd my-app
npm install
npm run dev
```

The starter also works with pnpm, Yarn, and Bun. It includes TypeScript/TSX,
Vite, Vitest, ESLint, Prettier, signals, components, `<Show>`, and `<For>`.

## Documentation

- [Getting started](docs/getting-started.md)
- [API reference](docs/api-reference.md)
- [React migration guide](docs/react-migration.md)
- [Event ordering](docs/event-ordering.md)
- [Architecture](docs/architecture/README.md)
- [Roadmap](docs/roadmap.md)
- [v0.1 readiness](docs/checkpoints/v0.1-readiness.md)
- [Release checklist](docs/release-checklist.md)

## Development

Benos requires Node.js `^22.18.0 || ^24.11.0 || >=26.0.0` and pnpm 10.17.0
for repository work. The range intersects Babel 8 and Vitest 5 support; Node
24.8 is below the supported 24.x floor.

```sh
pnpm install
pnpm test
pnpm build
pnpm lint
```

## License

MIT. See [LICENSE](LICENSE).
