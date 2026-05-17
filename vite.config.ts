import { defineConfig, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'
import { readFileSync } from 'fs'
import { createHash } from 'crypto'

const devMode = process.env.DEVMODE === 'true'
const pkg = JSON.parse(readFileSync('./package.json', 'utf-8'))

// Subresource Integrity for the entry script and stylesheet emitted into
// index.html. Computes sha-384 of the bundle output and rewrites the tags
// to carry an integrity attribute. Pure defense-in-depth: the strict CSP
// already locks script-src to 'self' and the Docker base image is digest-
// pinned, but SRI catches the narrow case where the served HTML is fresh
// but a cached or tampered asset response slips a different bundle past.
function sriPlugin(): Plugin {
  return {
    name: 'stift-sri',
    apply: 'build',
    enforce: 'post',
    transformIndexHtml: {
      order: 'post',
      handler(html, ctx) {
        if (!ctx.bundle) return html
        const integrityFor = (ref: string): string | null => {
          const key = ref.replace(/^\//, '')
          const asset = ctx.bundle![key]
          if (!asset) return null
          const content = asset.type === 'asset'
            ? (typeof asset.source === 'string' ? asset.source : Buffer.from(asset.source))
            : asset.code
          const digest = createHash('sha384').update(content).digest('base64')
          return `sha384-${digest}`
        }
        return html.replace(
          /<(script|link)\b([^>]*?)\s+(src|href)="([^"]+)"([^>]*)>/g,
          (match, tag, before, attrName, ref, after) => {
            if (/\bintegrity\s*=/.test(match)) return match
            const integrity = integrityFor(ref)
            if (!integrity) return match
            return `<${tag}${before} ${attrName}="${ref}"${after} integrity="${integrity}">`
          },
        )
      },
    },
  }
}

export default defineConfig({
  plugins: [react(), sriPlugin()],
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
