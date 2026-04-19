import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'
import { readFileSync } from 'fs'

const devMode = process.env.DEVMODE === 'true'
const pkg = JSON.parse(readFileSync('./package.json', 'utf-8'))

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  define: {
    '__STIFT_DEV__': JSON.stringify(devMode),
    '__STIFT_VERSION__': JSON.stringify(pkg.version),
  },
  build: {
    minify: devMode ? false : 'esbuild',
    sourcemap: devMode ? true : false,
  },
  server: {
    proxy: {
      '/api': 'http://localhost:3001',
    },
  },
})
