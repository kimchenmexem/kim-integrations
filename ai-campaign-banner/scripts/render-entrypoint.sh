#!/usr/bin/env sh
# Render container entrypoint.
#
# Render attaches the persistent disk at $STORAGE_ROOT (default /app/storage).
# Inside the standalone bundle the app expects to write to these paths:
#   - data/ (campaign plans, render maps, generated indexes)
#   - public/rendered-ads/ (flat PNGs from /api/render-campaign)
#   - public/nano-banana/ (PNGs from /api/generate-nano-banner)
#
# This script ensures those paths resolve onto the persistent disk by
# symlinking each one into $STORAGE_ROOT before the Next.js server boots.
# Idempotent — safe to re-run on every container start.

set -eu

STORAGE_ROOT="${STORAGE_ROOT:-/app/storage}"

mkdir -p \
  "${STORAGE_ROOT}/data" \
  "${STORAGE_ROOT}/rendered-ads" \
  "${STORAGE_ROOT}/nano-banana"

# Replace each writable path with a symlink onto the persistent disk.
# On the FIRST boot, seed the disk from whatever was baked into the image
# (e.g. the campaign snapshots committed to data/campaigns/) so the
# historical list-page entries still resolve. After that, the symlink
# stays in place across boots and the bundled copy is irrelevant.
link_to_storage() {
  app_path="$1"
  target="$2"
  if [ -L "$app_path" ]; then
    return
  fi
  if [ -d "$app_path" ] && [ -z "$(ls -A "$target" 2>/dev/null)" ]; then
    # Seed: storage is empty AND we have bundled content → copy it over.
    # `cp -r .../.` (note the trailing /.) copies hidden files too.
    cp -r "$app_path/." "$target/" 2>/dev/null || true
  fi
  rm -rf "$app_path"
  ln -s "$target" "$app_path"
}

link_to_storage "/app/data" "${STORAGE_ROOT}/data"
mkdir -p /app/public
link_to_storage "/app/public/rendered-ads" "${STORAGE_ROOT}/rendered-ads"
link_to_storage "/app/public/nano-banana" "${STORAGE_ROOT}/nano-banana"

exec "$@"
