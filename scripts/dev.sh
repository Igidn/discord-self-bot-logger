#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/.."

echo "Node version: $(node -v)"

echo "Installing root dependencies..."
npm install

echo "Rebuilding native modules from source (better-sqlite3, sharp)..."
npm rebuild better-sqlite3 sharp --build-from-source

echo "Verifying native modules load correctly..."
node -e "require('better-sqlite3'); console.log('✓ better-sqlite3 OK')"
node -e "require('sharp'); console.log('✓ sharp OK')"

echo "Installing dashboard-ui dependencies..."
cd dashboard-ui
npm install
cd ..

echo "Starting bot + dashboard dev concurrently..."

npx concurrently \
  -n "bot,dashboard" \
  -c "cyan,green" \
  "tsx watch src/main.ts" \
  "cd dashboard-ui && npx vite"
