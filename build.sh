#!/bin/sh
# Linux and macOS build: web app, server and desktop bundles. Needs Node.js 22+.
set -eu
cd "$(dirname "$0")"
command -v node >/dev/null || { echo "Node.js 22+ is required: run ./download-dependencies.sh"; exit 3; }
npm ci --no-audit --no-fund
node scripts/build.mjs
if [ "${1:-}" = "--run" ]; then npx electron .; fi
