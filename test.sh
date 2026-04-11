#!/bin/sh
set -e

# Visual + E2E tests for Stift examples.
#
# Usage:
#   ./test.sh visual          -- compare against reference screenshots
#   ./test.sh visual:update   -- update reference screenshots
#   ./test.sh e2e             -- interaction tests
#   ./test.sh all             -- visual + e2e
#   ./test.sh ci              -- full CI-identical run: build container,
#                                start it, run visual + e2e, stop it.
#                                Use this before pushing to verify the
#                                CI will pass.
#
# All modes except "ci" require a running Stift instance (docker compose up).

PLAYWRIGHT_IMAGE="mcr.microsoft.com/playwright:v1.52.0-noble"
DIR="$(cd "$(dirname "$0")" && pwd)"
THRESHOLD="${THRESHOLD:-0.01}"

run_playwright() {
  local script="$1"
  local outdir="$2"
  local url="${3:-${URL:-http://host.docker.internal:8080}}"
  docker run --rm \
    --add-host=host.docker.internal:host-gateway \
    -e URL="$url" \
    -e THRESHOLD="$THRESHOLD" \
    -v "$DIR/scripts:/scripts-src:ro" \
    -v "$DIR/test/reference:/reference:ro" \
    -v "$outdir:/screenshots" \
    "$PLAYWRIGHT_IMAGE" \
    bash -c "
      cp /scripts-src/*.mjs /tmp/ && cd /tmp &&
      npm install playwright@1.52.0 pngjs 2>/dev/null &&
      node $script
    "
}

# Build + start a fresh Stift container, identical to what CI does.
ci_start() {
  echo "Building Stift container..."
  docker build -t stift-ci "$DIR" -q
  echo "Starting Stift container on port 8090..."
  mkdir -p "$DIR/data"
  docker run -d --name stift-ci \
    -p 8090:8080 \
    -v "$DIR/data:/data" \
    stift-ci > /dev/null
  # Wait for health
  for i in $(seq 1 30); do
    if docker exec stift-ci wget -q --spider http://127.0.0.1:8080/api/config 2>/dev/null; then
      echo "Stift is ready."
      return 0
    fi
    sleep 2
  done
  echo "Timed out waiting for Stift." >&2
  docker logs stift-ci 2>&1 | tail -10 >&2
  ci_stop
  exit 1
}

ci_stop() {
  docker rm -f stift-ci 2>/dev/null || true
}

case "${1:-visual}" in
  visual)
    echo "Running visual regression tests..."
    run_playwright "test-examples.mjs" "$DIR/test"
    ;;
  visual:update)
    echo "Updating reference screenshots..."
    run_playwright "screenshot-examples.mjs" "$DIR/test/reference"
    echo "Reference images updated in test/reference/"
    ;;
  e2e)
    echo "Running E2E interaction tests..."
    run_playwright "e2e-test.mjs" "$DIR/test"
    ;;
  all)
    echo "Running all tests..."
    echo ""
    echo "=== Visual regression tests ==="
    run_playwright "test-examples.mjs" "$DIR/test"
    echo ""
    echo "=== E2E interaction tests ==="
    run_playwright "e2e-test.mjs" "$DIR/test"
    ;;
  ci)
    # Mirrors the CI workflow exactly: build, start, test, stop.
    trap ci_stop EXIT
    ci_start
    CI_URL="http://host.docker.internal:8090"
    echo ""
    echo "=== Visual regression tests ==="
    run_playwright "test-examples.mjs" "$DIR/test" "$CI_URL"
    echo ""
    echo "=== E2E interaction tests ==="
    run_playwright "e2e-test.mjs" "$DIR/test" "$CI_URL"
    echo ""
    echo "All CI tests passed."
    ;;
  *)
    echo "Usage: $0 {visual|visual:update|e2e|all|ci}"
    exit 1
    ;;
esac
