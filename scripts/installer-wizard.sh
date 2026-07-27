#!/bin/sh
# Guided installer wizard for UbeROS (PR-7 helper)
set -eu

SCRIPT_DIR="$(CDPATH='' cd -- "$(dirname -- "$0")" && pwd -P)"
ROOT_DIR="${SCRIPT_DIR}/.."

log() { printf '%s\n' "$*"; }
err() { printf 'error: %s\n' "$*" >&2; }
die() { err "$*"; exit 1; }

ask() {
  prompt="$1"
  default="$2"
  if [ -t 0 ]; then
    printf "%s" "$prompt"
    read ans
    [ -z "$ans" ] && ans="$default"
    printf '%s' "$ans"
  else
    # Non-interactive: return default
    printf '%s' "$default"
  fi
}

print_intro() {
  cat <<'EOF'
UbeROS Installer Wizard
This guided wizard helps create a working `.env` and prepare the workspace.
Press Enter to accept defaults.
EOF
}

main() {
  print_intro
  # Workspace
  default_ws="${HOME:+${HOME}/uberos-workspace}"
  ws="$(ask "Workspace path [${default_ws}]: " "${default_ws}")"
  # Port
  port="$(ask "Proxy port [8080]: " "8080")"
  # Version
  version="$(ask "UbeROS version [dev]: " "dev")"

  # Write .env.template if missing
  tmpl="${ROOT_DIR}/.env.template"
  if [ ! -f "$tmpl" ]; then
    cat > "$tmpl" <<EOF
UBEROS_WORKSPACE=
UBEROS_PORT=8080
UBEROS_VERSION=dev
EOF
    log "Created default .env.template"
  fi

  # Generate .env (do not overwrite existing .env)
  envf="${ROOT_DIR}/.env"
  if [ -f "$envf" ]; then
    log ".env already exists; leaving it unchanged"
  else
    cp "$tmpl" "$envf"
    sed "s|^UBEROS_WORKSPACE=\$|UBEROS_WORKSPACE=${ws}|" "$envf" > "$envf.tmp" && mv "$envf.tmp" "$envf"
    # Use portable sed replacement: write to temp file then move
    awk -v p="${port}" 'BEGIN{FS=OFS="="} /^UBEROS_PORT=/{ $2=p } { print }' "$envf" > "$envf.tmp" && mv "$envf.tmp" "$envf"
    awk -v v="${version}" 'BEGIN{FS=OFS="="} /^UBEROS_VERSION=/{ $2=v } { print }' "$envf" > "$envf.tmp" && mv "$envf.tmp" "$envf"
    log "Generated .env with workspace=${ws}, port=${port}, version=${version}"
  fi

  # Ensure workspace src exists
  ws_abs="$ws"
  case "$ws_abs" in
    /*) ;;
    *) ws_abs="${ROOT_DIR}/${ws_abs}" ;;
  esac
  if [ ! -d "$ws_abs/src" ]; then
    mkdir -p "$ws_abs/src" || die "could not create workspace at ${ws_abs}/src"
    log "Created workspace at ${ws_abs}"
  else
    log "Workspace already present at ${ws_abs}"
  fi

  log "Wizard complete. Run ./install.sh --mode local to continue."
}

main
