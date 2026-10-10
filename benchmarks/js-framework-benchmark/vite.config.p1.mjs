import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import { svelte } from '@sveltejs/vite-plugin-svelte'
import solid from 'vite-plugin-solid'
import benos from '../../packages/vite/dist/js/index.production.js'

const frameworkId = process.env.JFB_FRAMEWORK_ID ?? 'benos'
const framework = process.env.JFB_IMPL ?? frameworkId
const root = fileURLToPath(new URL('.', import.meta.url))
const repoRoot = fileURLToPath(new URL('../../', import.meta.url))
const coreDist =
  process.env.JFB_CORE_DIST ?? `${repoRoot}/packages/core/dist/js`
const domDist = process.env.JFB_DOM_DIST ?? `${repoRoot}/packages/dom/dist/js`
const outputName = process.env.JFB_FRAMEWORK_ID ?? framework
const tableFramework = framework.startsWith('table-')
const entryExtension = tableFramework
  ? 'tsx'
  : framework === 'benos'
    ? 'tsx'
    : framework === 'solid' || framework === 'react'
      ? 'jsx'
      : 'js'

const plugins = [
  {
    name: 'select-benchmark-entry',
    transformIndexHtml: {
      order: 'pre',
      handler(html) {
        return html.replace(
          '/src/main-benos.js',
          tableFramework
            ? '/src/' + framework + '.' + entryExtension
            : framework === 'benos'
              ? '/src/main-benos.tsx'
              : '/src/main-' + framework + '.' + entryExtension,
        )
      },
    },
  },
]

if (framework === 'vue') plugins.push(vue())
if (framework === 'svelte') plugins.push(svelte())
if (framework === 'solid' || framework === 'table-solid') plugins.push(solid())
if (framework === 'benos' || framework.startsWith('table-benos'))
  plugins.push(benos({ optimization: 'safe' }))

export default defineConfig({
  root,
  plugins,
  resolve: {
    alias: [
      {
        find: '@benosjs/core/internal',
        replacement: `${coreDist}/internal.production.js`,
      },
      {
        find: '@benosjs/core',
        replacement: `${coreDist}/index.production.js`,
      },
      {
        find: '@benosjs/dom/internal',
        replacement: `${domDist}/internal.production.js`,
      },
      {
        find: '@benosjs/dom',
        replacement: `${domDist}/index.production.js`,
      },
    ],
  },
  build: {
    outDir: `${root}dist/${outputName}`,
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
