#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/.."

echo "Building backend with tsup..."
npx tsup

echo "Building frontend with vite..."
cd dashboard-ui
npx vite build

echo "Build complete."
