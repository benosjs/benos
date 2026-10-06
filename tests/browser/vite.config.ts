import { fileURLToPath, URL } from 'node:url'
import { defineConfig } from 'vite'
import benos from '../../packages/vite/src/index.js'

const root = fileURLToPath(new URL('../../', import.meta.url))
const alias = (relative: string) =>
  fileURLToPath(new URL(relative, import.meta.url))

export default defineConfig({
  root,
  define: {
    'process.env.NODE_ENV': JSON.stringify('development'),
  },
  esbuild: {
    jsx: 'preserve',
  },
  optimizeDeps: {
    noDiscovery: true,
  },
  plugins: [benos({ optimization: 'none' })],
  resolve: {
    alias: [
      {
        find: '@benosjs/core/internal',
        replacement: alias(
          '../../packages/core/dist/js/internal.development.js',
        ),
      },
      {
        find: '@benosjs/core',
        replacement: alias('../../packages/core/dist/js/index.development.js'),
      },
      {
        find: '@benosjs/dom/internal',
        replacement: alias(
          '../../packages/dom/dist/js/internal.development.js',
        ),
      },
      {
        find: '@benosjs/dom',
        replacement: alias('../../packages/dom/dist/js/index.development.js'),
      },
      {
        find: '@benosjs/compiler',
        replacement: alias(
          '../../packages/compiler/dist/js/index.development.js',
        ),
      },
      {
        find: '@zag-js/select',
        replacement: alias(
          '../../packages/primitives/node_modules/@zag-js/select/dist/index.mjs',
        ),
      },
      ...['accordion', 'checkbox', 'radio-group', 'switch', 'tabs'].map(
        (name) => ({
          find: `@benosjs/primitives/${name}`,
          replacement: alias(
            `../../packages/primitives/dist/js/${name}.development.js`,
          ),
        }),
      ),
      ...['dialog', 'menu', 'popover', 'tooltip', 'toast'].map((name) => ({
        find: `@benosjs/primitives/${name}`,
        replacement: alias(
          `../../packages/primitives/dist/js/${name}.development.js`,
        ),
      })),
      {
        find: '@benosjs/primitives/select',
        replacement: alias(
          '../../packages/primitives/dist/js/select.development.js',
        ),
      },
      ...['accordion', 'checkbox', 'radio-group', 'switch', 'tabs'].map(
        (name) => ({
          find: `@zag-js/${name}`,
          replacement: alias(
            `../../packages/primitives/node_modules/@zag-js/${name}/dist/index.mjs`,
          ),
        }),
      ),
      ...['dialog', 'menu', 'popover', 'tooltip', 'toast'].map((name) => ({
        find: `@zag-js/${name}`,
        replacement: alias(
          `../../packages/primitives/node_modules/@zag-js/${name}/dist/index.mjs`,
        ),
      })),
      {
        find: '@zag-js/toast',
        replacement: alias(
          '../../packages/primitives/node_modules/@zag-js/toast/dist/index.mjs',
        ),
      },
      {
        find: '@zag-js/vanilla',
        replacement: alias(
          '../../packages/primitives/node_modules/@zag-js/vanilla/dist/index.mjs',
        ),
      },
    ],
  },
  server: {
    host: '127.0.0.1',
    port: 4173,
    strictPort: true,
  },
})
