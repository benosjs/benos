# Deploying the Benos UI catalog

The gallery is a static Vite application at `examples/ui-gallery/`. It builds
with the repository's workspace packages and writes static files to
`examples/ui-gallery/dist/`. This repository does not deploy it automatically;
no deployment has been performed.

## Vercel project settings

Create a Vercel project connected to `benosjs/benos`, using the repository
root as the **Root Directory**. Do not set `examples/ui-gallery` as the root:
the gallery imports workspace source and its build needs the root lockfile and
packages.

Set these project values:

| Setting          | Value                                                   |
| ---------------- | ------------------------------------------------------- |
| Framework preset | Vite                                                    |
| Node.js version  | `^22.18.0                                               |     | ^24.11.0 |     | >=26.0.0` |
| Install command  | `pnpm install --frozen-lockfile`                        |
| Build command    | `pnpm build && pnpm --filter @benosjs/ui-gallery build` |
| Output directory | `examples/ui-gallery/dist`                              |

The build compiles the framework packages first, then creates the production
catalog. Vercel can use preview deployments for pull requests and production
deployments for the selected branch. Guide links in the catalog point to
`main/docs/ui/components/`; publish the guide pages to `main` before making the
catalog public.

## Linking it from the website

After you review a production preview, assign the catalog a domain or path in
Vercel and add a “UI components” link to the existing website. Keep the domain
out of source until the Vercel project has a stable URL. The gallery is built
as a standalone static site; no framework package or registry endpoint is
needed at runtime.

## Verify a build locally

From the repository root:

```sh
pnpm install --frozen-lockfile
pnpm build
pnpm --filter @benosjs/ui-gallery build
```

Preview the generated catalog with:

```sh
pnpm --dir examples/ui-gallery exec vite preview --host 127.0.0.1
```

Open the URL printed by Vite. Confirm light, dark, and RTL panels render and
that each component's “Guide” link opens the matching document in the
repository.
