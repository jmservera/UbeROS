#!/bin/sh
# Workspace provisioning and migration helpers (PR-8)
set -eu

SCRIPT_DIR="$(CDPATH='' cd -- "$(dirname -- "$0")" && pwd -P)"
ROOT_DIR="${SCRIPT_DIR}/.."

log() { printf '%s\n' "$*"; }
err() { printf 'error: %s\n' "$*" >&2; }
die() { err "$*"; exit 1; }

ensure_src() {
  envf="${ROOT_DIR}/.env"
  if [ -f "$envf" ]; then
    ws="$(grep '^UBEROS_WORKSPACE=' "$envf" | cut -d= -f2-)"
  else
    die ".env not found; run the installer wizard first"
  fi
  ws="${ws:-${ROOT_DIR}/workspace}"
  case "$ws" in
    /*) ;;
    *) ws="${ROOT_DIR}/${ws}" ;;
  esac
  if [ ! -d "$ws/src" ]; then
    mkdir -p "$ws/src" || die "could not create $ws/src"
    log "Created $ws/src"
  else
    log "$ws/src already exists"
  fi
}

migrate_workspace() {
  # For future migrations: placeholder that copies legacy 'workspace' dir
  legacy="${ROOT_DIR}/workspace"
  envf="${ROOT_DIR}/.env"
  if [ -f "$envf" ]; then
    ws="$(grep '^UBEROS_WORKSPACE=' "$envf" | cut -d= -f2-)"
  else
    die ".env not found; run the installer wizard first"
  fi
  case "$ws" in
    /*) ;;
    *) ws="${ROOT_DIR}/${ws}" ;;
  esac
  if [ -d "$legacy/src" ] && [ ! -d "$ws/src" ]; then
    mkdir -p "$(dirname "$ws/src")"
    mv "$legacy/src" "$ws/" || die "migration failed"
    log "Migrated workspace src from ${legacy} to ${ws}"
  else
    log "No migration needed or target exists"
  fi
}

case "${1:-}" in
  ensure) ensure_src ;;
  migrate) migrate_workspace ;;
  *) echo "Usage: $0 {ensure|migrate}"; exit 2 ;;
esac
