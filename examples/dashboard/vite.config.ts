import { fileURLToPath, URL } from 'node:url'
import { defineConfig } from 'vite'
import solid from 'vite-plugin-solid'
import benos from '@benosjs/vite'

const root = fileURLToPath(new URL('.', import.meta.url))
const repoRoot = fileURLToPath(new URL('../../', import.meta.url))
const framework = process.env.DASHBOARD_FRAMEWORK ?? 'benos'
const entry = process.env.DASHBOARD_ENTRY ?? 'app'
const outputName = entry === 'slice' ? `${framework}-slice` : framework
const profileBuild = process.env.DASHBOARD_PROFILE === '1'

export default defineConfig(({ isSsrBuild }) => ({
  root,
  define: {
    'process.env.NODE_ENV': JSON.stringify(
      process.env.NODE_ENV ??
        (framework === 'solid' ? 'production' : 'development'),
    ),
  },
  esbuild: {
    jsx: 'preserve',
  },
  plugins:
    framework === 'solid'
      ? [solid()]
      : [
          benos({
            optimization:
              process.env.DASHBOARD_OPTIMIZATION === 'none' ? 'none' : 'safe',
          }),
        ],
  ...(framework === 'solid'
    ? {}
    : {
        optimizeDeps: {
          noDiscovery: true,
          exclude: [
            '@benosjs/core',
            '@benosjs/core/internal',
            '@benosjs/dom',
            '@benosjs/dom/internal',
            '@benosjs/async',
            '@benosjs/query',
            '@benosjs/router',
            '@benosjs/forms',
          ],
        },
      }),
  // The server bundle keeps every @benosjs package external and resolves them
  // from node_modules, so one copy of each runs on the server.
  resolve: {
    dedupe: [
      '@benosjs/core',
      '@benosjs/dom',
      '@benosjs/router',
      '@benosjs/async',
      '@benosjs/query',
      '@benosjs/forms',
    ],
    alias: isSsrBuild
      ? []
      : [
          {
            find: '@benosjs/core/internal',
            replacement: `${repoRoot}/packages/core/dist/js/internal.development.js`,
          },
          {
            find: '@benosjs/core',
            replacement: `${repoRoot}/packages/core/dist/js/index.development.js`,
          },
          {
            find: '@benosjs/dom/internal',
            replacement: `${repoRoot}/packages/dom/dist/js/internal.development.js`,
          },
          {
            find: '@benosjs/dom/hydrate',
            replacement: `${repoRoot}/packages/dom/dist/js/hydrate.development.js`,
          },
          {
            find: '@benosjs/dom',
            replacement: `${repoRoot}/packages/dom/dist/js/index.development.js`,
          },
        ],
  },
  build: {
    rollupOptions: {
      input:
        entry === 'slice'
          ? `${root}/${framework === 'solid' ? 'solid' : 'benos'}-slice.html`
          : `${root}/${framework === 'solid' ? 'solid' : 'index'}.html`,
    },
    outDir: `${root}dist/${outputName}`,
    emptyOutDir: true,
    target: 'es2022',
    minify: profileBuild ? false : 'esbuild',
    sourcemap: true,
  },
}))
