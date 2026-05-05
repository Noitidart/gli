#!/usr/bin/env sh
set -e

REPO="https://github.com/Noitidart/gli.git"
TMPDIR=$(mktemp -d)

echo "Installing gli..."

git clone --depth 1 "$REPO" "$TMPDIR/repo"
cd "$TMPDIR/repo"
npm install --ignore-scripts
npm run build
chmod +x dist/main.js
npm pack --silent
npm install -g gli-*.tgz

rm -rf "$TMPDIR"

echo "Done! 'gli' is now available globally."
