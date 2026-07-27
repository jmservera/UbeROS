#!/bin/sh
# UbeROS installer (Theme D/E/G, FR-D2/FR-D3/FR-E5/FR-G4).
#
# Bootstraps a UbeROS deployment from either a source checkout (local mode:
# build the images from source) or a released bundle (release mode: pull pinned
# images). This first stage implements local mode and the shared plumbing:
# argument parsing, mode auto-detection, `.env` generation from `.env.template`,
# and `--version`/`--help`. Guided wizard, workspace provisioning, and release
# mode land in later installer stages (PR-7, PR-8, PR-13).
#
# POSIX sh only (no bashisms) so the installer runs on the widest range of hosts.
set -eu

# Installer version (FR-G4). The release pipeline stamps the real version into
# the bundled copy; a source checkout reports `dev`.
INSTALLER_VERSION="dev"

# Resolve the repository/bundle root from this script's location so the
# installer works regardless of the caller's working directory.
SCRIPT_DIR="$(CDPATH='' cd -- "$(dirname -- "$0")" && pwd -P)"
ROOT_DIR="${SCRIPT_DIR}"

ENV_TEMPLATE="${ROOT_DIR}/.env.template"
ENV_FILE="${ROOT_DIR}/.env"

# Paths to helper scripts (Phase 3 additions)
WIZARD_SCRIPT="${ROOT_DIR}/scripts/installer-wizard.sh"
PROVISION_SCRIPT="${ROOT_DIR}/scripts/provision-workspace.sh"
COMPOSE_GEN_SCRIPT="${ROOT_DIR}/scripts/compose-release-gen.sh"

# Default ROS workspace location (FR-F1, BR-009). Deliberately outside the
# source checkout so colcon build/install/log output never dirties the repo. An
# exported UBEROS_WORKSPACE wins; otherwise fall back to $HOME. Without a usable
# HOME there is no safe location to guess, so stay empty and let ensure_env()
# fail with guidance rather than silently polluting the checkout.
DEFAULT_WORKSPACE="${UBEROS_WORKSPACE:-${HOME:+${HOME}/uberos-workspace}}"

MODE="" # empty => auto-detect

log() { printf '%s\n' "$*"; }
err() { printf 'error: %s\n' "$*" >&2; }
die() { err "$*"; exit 1; }

usage() {
  cat <<'EOF'
UbeROS installer

Usage: ./install.sh [options]

Options:
  --mode <local|release>  Installation mode. Defaults to auto-detect:
                            local   = build images from a source checkout
                            release = use pinned images from a release bundle
  --version               Print the installer version and exit.
  -h, --help              Show this help and exit.

Local mode builds every service image from source and starts the stack. Once it
is up, open the UbeROS UI through the proxy (default http://localhost:8080).
EOF
}

# Detect whether this tree is a source checkout (build from source) or a
# released bundle (pinned images). A bundle ships compose.release.yaml and no
# build contexts; a source checkout ships services/. The source checkout is
# tested first because a developer may have generated compose.release.yaml
# locally via scripts/gen-compose-release.sh, and that must not flip the tree
# into release mode.
detect_mode() {
  if [ -d "${ROOT_DIR}/services" ] && [ -f "${ROOT_DIR}/compose.yaml" ]; then
    printf 'local'
  elif [ -f "${ROOT_DIR}/compose.release.yaml" ]; then
    printf 'release'
  else
    printf 'unknown'
  fi
}

# Ensure a docker compose CLI is available (v2 plugin or legacy binary).
compose() {
  if docker compose version >/dev/null 2>&1; then
    docker compose "$@"
  elif command -v docker-compose >/dev/null 2>&1; then
    docker-compose "$@"
  else
    die "docker compose is required but was not found on PATH"
  fi
}

# Create .env from the template on first run; never clobber an existing .env so
# user edits survive re-runs (FR-E5).
ensure_env() {
  if [ -f "${ENV_FILE}" ]; then
    log "Keeping existing .env (not overwritten)."
    return 0
  fi
  [ -f "${ENV_TEMPLATE}" ] || die "missing ${ENV_TEMPLATE}; cannot generate .env"
  [ -n "${DEFAULT_WORKSPACE}" ] || die "cannot determine a workspace location (HOME is unset); set UBEROS_WORKSPACE to an absolute path outside this checkout and re-run"
  cp "${ENV_TEMPLATE}" "${ENV_FILE}"
  # The template ships UBEROS_WORKSPACE empty on purpose; resolve it to an
  # external directory so the source checkout stays clean (FR-F1, BR-009).
  sed "s|^UBEROS_WORKSPACE=\$|UBEROS_WORKSPACE=${DEFAULT_WORKSPACE}|" \
    "${ENV_FILE}" > "${ENV_FILE}.tmp" && mv "${ENV_FILE}.tmp" "${ENV_FILE}"
  log "Generated .env from .env.template (workspace: ${DEFAULT_WORKSPACE})."
}

# Run the guided wizard when interactive and when asked
run_wizard_if_needed() {
  if [ -x "${WIZARD_SCRIPT}" ]; then
    # If a user explicitly set NON_INTERACTIVE, skip the wizard
    if [ -t 0 ] && [ -z "${NON_INTERACTIVE:-}" ]; then
      sh "${WIZARD_SCRIPT}"
    else
      log "Skipping wizard (non-interactive mode or missing TTY)"
    fi
  fi
}

# Read a key from .env, ignoring comments and returning the first match.
env_value() {
  grep -E "^$1=" "${ENV_FILE}" 2>/dev/null | head -n1 | cut -d= -f2-
}

# Make sure the workspace `src` directory exists before compose bind-mounts it;
# otherwise Docker creates it as root and the container user cannot write.
ensure_workspace() {
  workspace="$(env_value UBEROS_WORKSPACE)"
  workspace="${workspace:-./workspace}"
  # Compose resolves relative bind-mount paths against the project directory
  # (ROOT_DIR), not the caller's cwd, so anchor relative values the same way.
  case "${workspace}" in
    /*) ;;
    *) workspace="${ROOT_DIR}/${workspace}" ;;
  esac
  if [ ! -d "${workspace}/src" ]; then
    mkdir -p "${workspace}/src" || die "could not create workspace at ${workspace}/src"
    log "Created ROS workspace at ${workspace}"
  fi
}

install_local() {
  [ -f "${ROOT_DIR}/compose.yaml" ] || die "local mode requires compose.yaml at ${ROOT_DIR}"
  run_wizard_if_needed
  ensure_env
  # Ensure workspace src exists; use provisioning helper if present
  if [ -x "${PROVISION_SCRIPT}" ]; then
    sh "${PROVISION_SCRIPT}" ensure
  else
    ensure_workspace
  fi
  log "Building UbeROS images from source..."
  ( cd "${ROOT_DIR}" && compose build )
  log "Starting the UbeROS stack..."
  ( cd "${ROOT_DIR}" && compose up -d )
  port="$(env_value UBEROS_PORT)"
  port="${port:-8080}"
  log "UbeROS is starting. Open the UI at http://localhost:${port}"
}

install_release() {
  # Release mode (pinned images, checksum verification, upgrade) is implemented
  # in a later installer stage (PR-13). Fail clearly until then.
  die "release mode is not available in this installer build yet"
}

# --- Argument parsing (POSIX) ------------------------------------------------
while [ "$#" -gt 0 ]; do
  case "$1" in
    --mode)
      [ "$#" -ge 2 ] || die "--mode requires an argument (local|release)"
      MODE="$2"
      shift 2
      ;;
    --mode=*)
      MODE="${1#--mode=}"
      shift
      ;;
    --version)
      printf '%s\n' "${INSTALLER_VERSION}"
      exit 0
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      err "unknown option: $1"
      usage >&2
      exit 2
      ;;
  esac
done

if [ -z "${MODE}" ]; then
  MODE="$(detect_mode)"
  [ "${MODE}" = "unknown" ] && die "could not auto-detect install mode; pass --mode local|release"
  log "Auto-detected install mode: ${MODE}"
fi

case "${MODE}" in
  local) install_local ;;
  release) install_release ;;
  *) die "invalid mode: ${MODE} (expected local or release)" ;;
esac
