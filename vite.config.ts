import { defineConfig, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'
import { readFileSync, writeFileSync } from 'fs'
import { createHash } from 'crypto'

const devMode = process.env.DEVMODE === 'true'
const pkg = JSON.parse(readFileSync('./package.json', 'utf-8'))

// Subresource Integrity for the entry script and stylesheet emitted into
// index.html. Computes sha-384 of the bundle output and rewrites the tags
// to carry an integrity attribute. Pure defense-in-depth: the strict CSP
// already locks script-src to 'self' and the Docker base image is digest-
// pinned, but SRI catches the narrow case where the served HTML is fresh
// but a cached or tampered asset response slips a different bundle past.
//
// Runs in writeBundle.post -- not transformIndexHtml -- because Vite's
// build-import-analysis plugin still mutates chunk code in generateBundle
// after transformIndexHtml has fired (it inlines the preload helper and
// final cross-chunk references). Hashing chunk.code at that point yields
// a digest that does not match the bytes that actually end up on disk,
// and the browser then refuses to execute the bundle. Reading the files
// back from disk after writeBundle removes that race entirely.
function sriPlugin(): Plugin {
  return {
    name: 'stift-sri',
    apply: 'build',
    enforce: 'post',
    writeBundle: {
      order: 'post',
      handler(opts, bundle) {
        const outDir = opts.dir ?? 'dist'
        const indexKey = Object.keys(bundle).find((k) => k.endsWith('index.html'))
        if (!indexKey) return
        const indexPath = path.join(outDir, indexKey)
        const html = readFileSync(indexPath, 'utf-8')
        const integrityFor = (ref: string): string | null => {
          const key = ref.replace(/^\//, '')
          if (!bundle[key]) return null
          const buf = readFileSync(path.join(outDir, key))
          return `sha384-${createHash('sha384').update(buf).digest('base64')}`
        }
        const patched = html.replace(
          /<(script|link)\b([^>]*?)\s+(src|href)="([^"]+)"([^>]*)>/g,
          (match, tag, before, attrName, ref, after) => {
            if (/\bintegrity\s*=/.test(match)) return match
            const integrity = integrityFor(ref)
            if (!integrity) return match
            return `<${tag}${before} ${attrName}="${ref}"${after} integrity="${integrity}">`
          },
        )
        if (patched !== html) writeFileSync(indexPath, patched)
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
