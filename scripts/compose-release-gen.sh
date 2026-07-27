#!/bin/sh
# Generate compose.release.yaml from compose.yaml with pinned image tags guard (PR-11)
set -eu

SCRIPT_DIR="$(CDPATH='' cd -- "$(dirname -- "$0")" && pwd -P)"
ROOT_DIR="${SCRIPT_DIR}/.."

log() { printf '%s\n' "$*"; }
err() { printf 'error: %s\n' "$*" >&2; }
die() { err "$*"; exit 1; }

SRC_COMPOSE="${ROOT_DIR}/compose.yaml"
OUT_COMPOSE="${ROOT_DIR}/compose.release.yaml"

[ -f "$SRC_COMPOSE" ] || die "compose.yaml not found"

# Very small generator: copy compose.yaml but fail if any image: uses unpinned 'latest' or no tag
if awk '/image:/ { img=$2; if (img ~ /:latest$/ || img !~ /:/) { print img; exit 2 } }' "$SRC_COMPOSE" >/dev/null 2>&1; then
  cp "$SRC_COMPOSE" "$OUT_COMPOSE" || die "failed to write ${OUT_COMPOSE}"
else
  die "compose.yaml contains unpinned images (no tag or :latest). Pin all images before generating ${OUT_COMPOSE}"
fi

log "Generated ${OUT_COMPOSE} from ${SRC_COMPOSE}"
