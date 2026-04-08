# Development & Testing

## Local dev server

```bash
npm install
npm run dev
```

Vite serves the SPA on `http://localhost:5173` and proxies `/api/*` to a separately-running backend (`docker compose up` in another terminal, or `node docker/server.js` directly).

## Development build

```bash
DEVMODE=true docker compose up --build
```

Sets the `DEVMODE` build arg, which disables minification, includes source maps, and surfaces the orange "DEVELOPMENT BUILD" banner. Different from `DEV_MODE` (runtime, see below).

## Runtime development mode

```bash
DEV_MODE=true docker compose up
```

Turns on verbose request logging in the API container (every request is printed with method, path, status, and timing) and shows a `⚠ DEV MODE` banner in the status bar. Never enable in production.

## Testing

```bash
# Unit tests (Vitest)
npm test

# Visual regression (Playwright in Docker)
./test.sh visual

# E2E interaction tests (Playwright in Docker)
./test.sh e2e

# All browser tests together
./test.sh all

# Update reference screenshots after intentional changes
./test.sh visual:update
```

The browser tests assume a Stift container running on `http://host.docker.internal:8080`. Override the URL with the `URL` env var:

```bash
URL=http://host.docker.internal:9090 ./test.sh visual
```

## Built-In Examples

Six example projects accessible from the onboarding screen, used by the visual regression suite:

1. **Bug Report**: annotated dashboard with numbered steps, arrows, blur, and redaction
2. **PCB Inspection**: circuit board with color-coded findings and component highlights
3. **Weld Cross-Section Analysis**: composite figure with overview + detail magnifications connected by callout lines
4. **Server Room Audit**: real photograph with cable management, LED warnings, and capacity findings
5. **Bridge Inspection**: concrete surface with dimension measurement, crack analysis, and structural rating
6. **Solar Panel Array**: real photograph with hotspot detection, soiling zone, and performance data

## Image Credits

Examples 4 and 6 use photographs under the [Unsplash License](https://unsplash.com/license):

- **Server Rack** (Example 4): Photo by [Taylor Vick](https://unsplash.com/@tvick) on [Unsplash](https://unsplash.com/photos/M5tzZtFCOfs)
- **Solar Panel Array** (Example 6): Photo by [American Public Power Association](https://unsplash.com/@publicpowerorg) on [Unsplash](https://unsplash.com/photos/FUeb2npsblQ)
