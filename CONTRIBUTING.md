# Contributing to Stift

Thank you for your interest in contributing to Stift!

## Getting Started

```bash
git clone <repository-url>
cd stift
npm install
npm run dev
```

Open http://localhost:5173 in your browser.

## Development

- **Stack**: React 19, TypeScript, Vite, Konva.js, Zustand, Tailwind CSS
- **Build**: `npm run build`
- **Tests**: `npm test` (unit), `./test.sh visual` (visual regression), `./test.sh e2e` (E2E), `./test.sh all` (visual + E2E)
- **Full CI check**: `./test.sh ci` builds the Docker image and runs visual + E2E tests inside the same Playwright container that CI uses. This is the authoritative pre-push check.
- **Docker**: `docker compose up` (production build)

## Pull Requests

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/your-feature`)
3. Make your changes
4. Run all tests (`npm test && ./test.sh ci`)
5. Commit with a clear message
6. Open a pull request

## Code Style

- No `console.log` in production code
- No `TODO`/`FIXME` comments; open an issue instead
- TypeScript strict mode (enforced by Docker build)
- Keep components small and focused

## License

By contributing, you agree that your contributions will be licensed under the [EUPL-1.2](LICENSE).
