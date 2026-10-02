import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import { svelte } from '@sveltejs/vite-plugin-svelte'
import solid from 'vite-plugin-solid'

const framework = process.env.JFB_FRAMEWORK ?? 'benos'
const root = fileURLToPath(new URL('.', import.meta.url))
const repoRoot = fileURLToPath(new URL('../../', import.meta.url))
const entryExtension =
  framework === 'solid' || framework === 'react' ? 'jsx' : 'js'

const plugins = [
  {
    name: 'select-benchmark-entry',
    transformIndexHtml: {
      order: 'pre',
      handler(html) {
        return html.replace(
          '/src/main-benos.js',
          `/src/main-${framework}.${entryExtension}`,
        )
      },
    },
  },
]

if (framework === 'vue') plugins.push(vue())
if (framework === 'svelte') plugins.push(svelte())
if (framework === 'solid') plugins.push(solid())

export default defineConfig({
  root,
  plugins,
  resolve: {
    alias: [
      {
        find: '@benosjs/core/internal',
        replacement: `${repoRoot}/packages/core/dist/js/internal.production.js`,
      },
      {
        find: '@benosjs/core',
        replacement: `${repoRoot}/packages/core/dist/js/index.production.js`,
      },
      {
        find: '@benosjs/dom',
        replacement: `${repoRoot}/packages/dom/dist/js/index.production.js`,
      },
    ],
  },
  build: {
    outDir: `${root}dist/${framework}`,
    emptyOutDir: true,
    target: 'es2022',
    minify: 'esbuild',
  },
  server: {
    strictPort: true,
  },
  preview: {
    strictPort: true,
  },
})
