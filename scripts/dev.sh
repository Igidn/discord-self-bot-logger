#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/.."

echo "Starting bot + dashboard dev concurrently..."

npx concurrently \
  -n "bot,dashboard" \
  -c "cyan,green" \
  "tsx watch src/main.ts" \
  "cd dashboard-ui && npx vite"
