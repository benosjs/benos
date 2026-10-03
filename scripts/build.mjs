import { resolve } from 'node:path'
import { build } from 'vite'

const packages = [
  'core',
  'dom',
  'compiler',
  'vite',
  'eslint-plugin',
  'primitives',
]

for (const name of packages) {
  const root = resolve('packages', name)
  const entries =
    name === 'core'
      ? ['index', 'internal']
      : name === 'dom'
        ? ['index', 'internal', 'jsx-runtime', 'jsx-dev-runtime']
        : name === 'primitives'
          ? [
              'accordion',
              'checkbox',
              'dialog',
              'menu',
              'popover',
              'radio-group',
              'select',
              'switch',
              'tabs',
              'toast',
              'tooltip',
            ]
          : ['index']

  for (const mode of ['development', 'production']) {
    for (const entry of entries) {
      await build({
        configFile: false,
        root,
        mode,
        define: { 'process.env.NODE_ENV': JSON.stringify(mode) },
        build: {
          target: 'es2022',
          outDir: 'dist/js',
          emptyOutDir: mode === 'development' && entry === entries[0],
          minify: mode === 'production' ? 'esbuild' : false,
          sourcemap: mode === 'development',
          lib: {
            entry: resolve(root, `src/${entry}.ts`),
            formats: ['es'],
            fileName: () => `${entry}.${mode}.js`,
          },
          rollupOptions: {
            external: (id) =>
              id.startsWith('@benosjs/') ||
              id.startsWith('@zag-js/') ||
              id.startsWith('@babel/') ||
              id.startsWith('node:'),
          },
        },
      })
    }
  }
}
