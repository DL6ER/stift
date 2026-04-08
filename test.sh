#!/bin/sh
set -e

# Visual regression tests for Stift examples
# Usage:
#   ./test.sh visual          -- compare examples against reference screenshots
#   ./test.sh visual:update   -- update reference screenshots
#
# Requires: Docker, running Stift instance (docker compose up)
# No other host dependencies needed.

URL="${URL:-http://host.docker.internal:8080}"
THRESHOLD="${THRESHOLD:-0.01}"
PLAYWRIGHT_IMAGE="mcr.microsoft.com/playwright:v1.52.0-noble"
DIR="$(cd "$(dirname "$0")" && pwd)"

run_playwright() {
  local script="$1"
  local outdir="$2"
  docker run --rm \
    --add-host=host.docker.internal:host-gateway \
    -e URL="$URL" \
    -e THRESHOLD="$THRESHOLD" \
    -v "$DIR/scripts:/scripts-src:ro" \
    -v "$DIR/test/reference:/reference:ro" \
    -v "$outdir:/screenshots" \
    "$PLAYWRIGHT_IMAGE" \
    bash -c "
      cp /scripts-src/*.mjs /tmp/ && cd /tmp &&
      npm install playwright@1.52.0 2>/dev/null &&
      node $script
    "
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
  *)
    echo "Usage: $0 {visual|visual:update|e2e|all}"
    exit 1
    ;;
esac
