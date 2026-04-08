import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'

const devMode = process.env.DEVMODE === 'true'

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  define: {
    '__STIFT_DEV__': JSON.stringify(devMode),
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
