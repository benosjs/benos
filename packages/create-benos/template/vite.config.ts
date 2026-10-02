import { defineConfig } from 'vite'
import benos from '@benosjs/vite'

export default defineConfig({
  plugins: [benos({ exclude: [/\.test\.tsx$/] })],
})
