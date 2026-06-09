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

# Merge the bundled snapshot into the persistent disk on EVERY boot
# (no-clobber: never overwrites files already on the disk). This means:
#   - First boot:        bundled files seed the empty volume.
#   - Subsequent boots:  any newly-bundled files (e.g. a fresh
#                        brand-kit-lite.generated.json shipped in a later
#                        image) get added; existing user data stays intact.
#   - Recovery boots:    if a prior deploy left the disk partially seeded,
#                        the missing files get filled in.
# `cp -rn` = recursive, no-clobber. `/.` (trailing dot) copies hidden files.
# Errors are logged but non-fatal — a missing source dir shouldn't take down
# the whole service.
merge_into_storage() {
  bundled="$1"
  storage="$2"
  if [ ! -d "$bundled" ] || [ -L "$bundled" ]; then
    return
  fi
  if cp -rn "$bundled/." "$storage/" 2>&1; then
    echo "[entrypoint] merged $bundled → $storage"
  else
    echo "[entrypoint] warn: merge from $bundled failed (continuing)"
  fi
}

merge_into_storage /app/data "${STORAGE_ROOT}/data"
merge_into_storage /app/public/rendered-ads "${STORAGE_ROOT}/rendered-ads"
merge_into_storage /app/public/nano-banana "${STORAGE_ROOT}/nano-banana"

# Replace each baked-in directory with a symlink onto the persistent disk.
link_to_storage() {
  app_path="$1"
  target="$2"
  if [ -L "$app_path" ]; then
    return
  fi
  rm -rf "$app_path"
  ln -s "$target" "$app_path"
  echo "[entrypoint] symlinked $app_path → $target"
}

link_to_storage "/app/data" "${STORAGE_ROOT}/data"
mkdir -p /app/public
link_to_storage "/app/public/rendered-ads" "${STORAGE_ROOT}/rendered-ads"
link_to_storage "/app/public/nano-banana" "${STORAGE_ROOT}/nano-banana"

exec "$@"
