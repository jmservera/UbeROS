#!/bin/sh
# UbeROS installer (Themes D/E/F/G).
#
# Bootstraps a UbeROS deployment from either a source checkout (local mode:
# build the images from source) or a released bundle (release mode: pinned
# images).
#
# Implemented here:
#   * shared plumbing: argument parsing, mode auto-detection, `--version`/`--help`
#     (FR-D2, FR-D3, FR-G4)
#   * `.env` generation from `.env.template`, never clobbering an existing `.env`
#     (FR-E5)
#   * guided wizard with defaults, plus `--non-interactive` and `--config <file>`
#     for silent installs, and validation of every answer (FR-E1..FR-E4)
#   * external workspace provisioning, optional `--workspace-repo` seeding, and
#     copy-then-verify migration of a repo-local `./workspace` (FR-F2..FR-F4)
#
# Release mode (pinned images, checksum verification, upgrade) lands in a later
# installer stage (PR-13).
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

# Repo-local workspace kept by pre-FR-F1 installs; the migration offer copies
# out of here (FR-F4).
LEGACY_WORKSPACE="${ROOT_DIR}/workspace"

MODE=""              # empty => auto-detect
INTERACTIVE="auto"   # auto | never  (never == --non-interactive)
CONFIG_FILE=""
MIGRATE=""           # empty => ask; yes | no when forced from the CLI/config
DRY_RUN=""           # non-empty => configure and provision, but never call Docker

# Answers. Empty means "not supplied yet"; the wizard or the defaults fill them.
OPT_WORKSPACE="${UBEROS_WORKSPACE:-}"
OPT_PORT=""
OPT_GPU=""
OPT_WORKSPACE_REPO=""

DEFAULT_PORT="8080"
DEFAULT_GPU="none"

log() { printf '%s\n' "$*"; }
err() { printf 'error: %s\n' "$*" >&2; }
die() { err "$*"; exit 1; }

usage() {
  cat <<'EOF'
UbeROS installer

Usage: ./install.sh [options]

Options:
  --mode <local|release>    Installation mode. Defaults to auto-detect:
                              local   = build images from a source checkout
                              release = use pinned images from a release bundle
  --non-interactive, -y     Never prompt. Use defaults, --config values, and
                            CLI flags only. Fails instead of asking.
  --config <file>           Read answers from a KEY=VALUE file (see below).
                            Implies --non-interactive.
  --workspace <path>        Absolute host path for the ROS workspace.
                            Default: $HOME/uberos-workspace
  --workspace-repo <git>    Clone this repository into <workspace>/src when the
                            workspace is empty.
  --port <1-65535>          Host port published by the proxy. Default: 8080
  --gpu <none|gpu|intel|wsl>
                            GPU overlay to apply. Default: none
  --migrate | --no-migrate  Copy (or skip copying) an existing ./workspace/src
                            into the external workspace without prompting.
  --dry-run                 Resolve and validate the configuration, write .env,
                            and provision the workspace, but do not build or
                            start anything.
  --version                 Print the installer version and exit.
  -h, --help                Show this help and exit.

Config file keys (all optional):
  UBEROS_WORKSPACE, UBEROS_WORKSPACE_REPO, UBEROS_PORT, UBEROS_GPU, UBEROS_MIGRATE

Local mode builds every service image from source and starts the stack. Once it
is up, open the UbeROS UI through the proxy (default http://localhost:8080).
EOF
}

# --- Small helpers -----------------------------------------------------------

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

# True when the installer may prompt: not forced off and stdin is a terminal.
can_prompt() {
  [ "${INTERACTIVE}" != "never" ] && [ -t 0 ]
}

# Prompt for a value, echoing the prompt on stderr so `$(ask ...)` captures only
# the answer. An empty answer keeps the default.
ask() {
  _prompt="$1"
  _default="$2"
  printf '%s [%s]: ' "${_prompt}" "${_default}" >&2
  IFS= read -r _answer || _answer=""
  [ -n "${_answer}" ] || _answer="${_default}"
  printf '%s' "${_answer}"
}

# Yes/no prompt. $2 is the default when the user just presses Enter.
confirm() {
  _reply="$(ask "$1 (y/n)" "$2")"
  case "${_reply}" in
    y|Y|yes|YES) return 0 ;;
    *) return 1 ;;
  esac
}

# Read a key from .env. `head -n1` keeps the result single-valued even if a
# hand-edited file ends up with duplicate keys, so callers never get a
# multi-line value that breaks path handling.
env_value() {
  [ -f "${ENV_FILE}" ] || return 0
  grep -E "^$1=" "${ENV_FILE}" 2>/dev/null | head -n1 | cut -d= -f2-
}

# Set a key in .env, replacing the first occurrence or appending when absent.
# Uses awk rather than sed so values containing `|`, `&`, or `/` (all legal in
# paths and URLs) cannot corrupt the substitution.
set_env_value() {
  _key="$1"
  _value="$2"
  awk -v k="${_key}" -v v="${_value}" '
    BEGIN { done = 0 }
    { sub(/\r$/, "") }
    done == 0 && index($0, k "=") == 1 { print k "=" v; done = 1; next }
    { print }
    END { if (done == 0) print k "=" v }
  ' "${ENV_FILE}" > "${ENV_FILE}.tmp" && mv "${ENV_FILE}.tmp" "${ENV_FILE}"
}

# --- Validation (FR-E3) ------------------------------------------------------

validate_port() {
  case "$1" in
    ''|*[!0-9]*)
      err "invalid port '$1': expected a number between 1 and 65535"
      return 1
      ;;
  esac
  if [ "$1" -lt 1 ] || [ "$1" -gt 65535 ]; then
    err "invalid port '$1': out of range (1-65535)"
    return 1
  fi
  return 0
}

validate_workspace() {
  _ws="$1"
  if [ -z "${_ws}" ]; then
    err "workspace path is empty; pass --workspace <absolute-path> (HOME is unset, so no default could be derived)"
    return 1
  fi
  case "${_ws}" in
    /*) ;;
    *)
      err "workspace '${_ws}' must be an absolute path so compose bind mounts resolve the same way from any directory"
      return 1
      ;;
  esac
  # Keeping the workspace outside the checkout is the whole point of FR-F1:
  # colcon build/install/log output must never dirty the repository.
  case "${_ws}" in
    "${ROOT_DIR}"|"${ROOT_DIR}"/*)
      err "workspace '${_ws}' is inside the source checkout (${ROOT_DIR}); choose a path outside it so builds never dirty the repo"
      return 1
      ;;
  esac
  _parent="$(dirname "${_ws}")"
  if [ ! -d "${_parent}" ]; then
    err "workspace parent directory '${_parent}' does not exist; create it first or choose another path"
    return 1
  fi
  if [ ! -w "${_parent}" ]; then
    err "workspace parent directory '${_parent}' is not writable by the current user"
    return 1
  fi
  return 0
}

validate_gpu() {
  case "$1" in
    none) return 0 ;;
    gpu|intel|wsl)
      if [ ! -f "${ROOT_DIR}/compose.override.$1.yaml" ]; then
        err "GPU overlay '$1' selected but ${ROOT_DIR}/compose.override.$1.yaml is missing"
        return 1
      fi
      return 0
      ;;
    *)
      err "invalid GPU overlay '$1': expected none, gpu, intel, or wsl"
      return 1
      ;;
  esac
}

# --- Config file (FR-E2) -----------------------------------------------------

# Parse a KEY=VALUE answers file. Parsed line by line against an allowlist
# rather than sourced, so a config file can never execute arbitrary commands.
load_config() {
  _file="$1"
  [ -f "${_file}" ] || die "config file not found: ${_file}"
  _lineno=0
  while IFS= read -r _line || [ -n "${_line}" ]; do
    _lineno=$((_lineno + 1))
    _line="$(printf '%s' "${_line}" | tr -d '\r')"
    case "${_line}" in
      ''|\#*) continue ;;
    esac
    _key="${_line%%=*}"
    _val="${_line#*=}"
    case "${_key}" in
      UBEROS_WORKSPACE)      [ -n "${OPT_WORKSPACE}" ]      || OPT_WORKSPACE="${_val}" ;;
      UBEROS_WORKSPACE_REPO) [ -n "${OPT_WORKSPACE_REPO}" ] || OPT_WORKSPACE_REPO="${_val}" ;;
      UBEROS_PORT)           [ -n "${OPT_PORT}" ]           || OPT_PORT="${_val}" ;;
      UBEROS_GPU)            [ -n "${OPT_GPU}" ]            || OPT_GPU="${_val}" ;;
      UBEROS_MIGRATE)        [ -n "${MIGRATE}" ]            || MIGRATE="${_val}" ;;
      *) die "unknown key '${_key}' in ${_file} line ${_lineno}" ;;
    esac
  done < "${_file}"
}

# --- Wizard (FR-E1) ----------------------------------------------------------

# Collect and validate every answer. Prompts when a terminal is available and
# --non-interactive was not requested; otherwise defaults and CLI/config values
# are used as-is. Values already fixed on the command line are never re-asked.
run_wizard() {
  # Values already in .env win over the built-in defaults so re-running the
  # installer never silently resets a port or workspace the user changed by
  # hand. Explicit CLI/config answers still take precedence over both.
  _default_ws="${OPT_WORKSPACE:-$(env_value UBEROS_WORKSPACE)}"
  [ -n "${_default_ws}" ] || _default_ws="${HOME:+${HOME}/uberos-workspace}"
  _default_port="${OPT_PORT:-$(env_value UBEROS_PORT)}"
  [ -n "${_default_port}" ] || _default_port="${DEFAULT_PORT}"
  _default_gpu="${OPT_GPU:-${DEFAULT_GPU}}"

  if can_prompt; then
    log ""
    log "UbeROS setup - press Enter to accept the value in brackets."
    log ""
    while :; do
      OPT_WORKSPACE="$(ask "ROS workspace directory (outside this checkout)" "${_default_ws}")"
      validate_workspace "${OPT_WORKSPACE}" && break
    done
    while :; do
      OPT_PORT="$(ask "Host port for the UbeROS UI" "${_default_port}")"
      validate_port "${OPT_PORT}" && break
    done
    while :; do
      OPT_GPU="$(ask "GPU overlay (none, gpu, intel, wsl)" "${_default_gpu}")"
      validate_gpu "${OPT_GPU}" && break
    done
    log ""
  else
    OPT_WORKSPACE="${_default_ws}"
    OPT_PORT="${_default_port}"
    OPT_GPU="${_default_gpu}"
    validate_workspace "${OPT_WORKSPACE}" || exit 1
    validate_port "${OPT_PORT}" || exit 1
    validate_gpu "${OPT_GPU}" || exit 1
    log "Non-interactive setup: workspace=${OPT_WORKSPACE} port=${OPT_PORT} gpu=${OPT_GPU}"
  fi
}

# --- .env generation (FR-E5) -------------------------------------------------

# Create .env from the template on first run; never clobber an existing .env so
# user edits survive re-runs. Answers are written on both paths so a re-run can
# still relocate the workspace or change the port when asked to.
write_env() {
  if [ -f "${ENV_FILE}" ]; then
    log "Keeping existing .env (values you changed are preserved)."
  else
    [ -f "${ENV_TEMPLATE}" ] || die "missing ${ENV_TEMPLATE}; cannot generate .env"
    cp "${ENV_TEMPLATE}" "${ENV_FILE}"
    log "Generated .env from .env.template."
  fi
  set_env_value UBEROS_WORKSPACE "${OPT_WORKSPACE}"
  set_env_value UBEROS_PORT "${OPT_PORT}"
}

# --- Workspace provisioning (FR-F2, FR-F3, FR-F4) ----------------------------

# Seed <workspace>/src from a git repository. Only ever runs against an empty
# src so an existing workspace is never overwritten.
seed_workspace_repo() {
  _src="$1/src"
  command -v git >/dev/null 2>&1 || die "--workspace-repo requires git on PATH"
  if [ -n "$(ls -A "${_src}" 2>/dev/null || true)" ]; then
    log "Workspace ${_src} is not empty; skipping clone of ${OPT_WORKSPACE_REPO}."
    return 0
  fi
  log "Cloning ${OPT_WORKSPACE_REPO} into ${_src}..."
  git clone --depth 1 "${OPT_WORKSPACE_REPO}" "${_src}" \
    || die "failed to clone ${OPT_WORKSPACE_REPO}"
}

# Copy-then-verify migration of a repo-local ./workspace/src (FR-F4). The source
# is never deleted automatically; the user is told how to remove it once happy.
migrate_legacy_workspace() {
  _target="$1/src"
  [ -d "${LEGACY_WORKSPACE}/src" ] || return 0
  [ -n "$(ls -A "${LEGACY_WORKSPACE}/src" 2>/dev/null || true)" ] || return 0
  # Nothing to migrate when the checkout IS the configured workspace.
  [ "${LEGACY_WORKSPACE}/src" != "${_target}" ] || return 0

  case "${MIGRATE}" in
    no|NO|n|N|false)
      log "Skipping migration of ${LEGACY_WORKSPACE}/src (--no-migrate)."
      return 0
      ;;
    yes|YES|y|Y|true) ;;
    '')
      if can_prompt; then
        if ! confirm "Copy existing packages from ${LEGACY_WORKSPACE}/src to ${_target}?" "y"; then
          log "Skipping migration."
          return 0
        fi
      else
        log "Found ${LEGACY_WORKSPACE}/src but running non-interactively; skipping migration (pass --migrate to copy)."
        return 0
      fi
      ;;
    *) die "invalid migrate value '${MIGRATE}': expected yes or no" ;;
  esac

  log "Copying ${LEGACY_WORKSPACE}/src -> ${_target}..."
  ( cd "${LEGACY_WORKSPACE}/src" && tar cf - . ) | ( cd "${_target}" && tar xf - ) \
    || die "migration copy failed; ${LEGACY_WORKSPACE}/src was left untouched"

  # Verify every source file landed in the target before declaring success.
  # The report lives in a temp file so a failed migration never leaves a stray
  # artifact inside the checkout.
  _report="$(mktemp "${TMPDIR:-/tmp}/uberos-migrate.XXXXXX")"
  ( cd "${LEGACY_WORKSPACE}/src" && find . -type f -print ) \
    | while IFS= read -r _rel; do
        [ -f "${_target}/${_rel}" ] || printf '%s\n' "${_rel}"
      done > "${_report}"
  if [ -s "${_report}" ]; then
    err "migration verification failed: $(wc -l < "${_report}" | tr -d ' ') file(s) missing in ${_target}"
    err "missing files:"
    sed 's/^/  /' "${_report}" >&2
    rm -f "${_report}"
    die "${LEGACY_WORKSPACE}/src was left untouched"
  fi
  rm -f "${_report}"
  log "Migration verified. The original is still at ${LEGACY_WORKSPACE}/src;"
  log "remove it yourself once you are happy with the new workspace."
}

# Create the workspace `src` directory before compose bind-mounts it; otherwise
# Docker creates it as root and the container user cannot write.
provision_workspace() {
  _ws="$1"
  if [ ! -d "${_ws}/src" ]; then
    mkdir -p "${_ws}/src" || die "could not create workspace at ${_ws}/src"
    log "Created ROS workspace at ${_ws}"
  else
    log "Using existing ROS workspace at ${_ws}"
  fi
  if [ -n "${OPT_WORKSPACE_REPO}" ]; then
    seed_workspace_repo "${_ws}"
  fi
  migrate_legacy_workspace "${_ws}"
}

# --- Install flows -----------------------------------------------------------

install_local() {
  [ -f "${ROOT_DIR}/compose.yaml" ] || die "local mode requires compose.yaml at ${ROOT_DIR}"
  run_wizard
  write_env
  provision_workspace "${OPT_WORKSPACE}"

  set -- -f "${ROOT_DIR}/compose.yaml"
  if [ "${OPT_GPU}" != "none" ]; then
    set -- "$@" -f "${ROOT_DIR}/compose.override.${OPT_GPU}.yaml"
    log "Applying GPU overlay: compose.override.${OPT_GPU}.yaml"
  fi

  if [ -n "${DRY_RUN}" ]; then
    log "Dry run: configuration and workspace are ready; skipping build and start."
    return 0
  fi

  log "Building UbeROS images from source..."
  ( cd "${ROOT_DIR}" && compose "$@" build )
  log "Starting the UbeROS stack..."
  ( cd "${ROOT_DIR}" && compose "$@" up -d )
  log "UbeROS is starting. Open the UI at http://localhost:${OPT_PORT}"
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
      MODE="$2"; shift 2 ;;
    --mode=*)
      MODE="${1#--mode=}"; shift ;;
    --workspace)
      [ "$#" -ge 2 ] || die "--workspace requires a path"
      OPT_WORKSPACE="$2"; shift 2 ;;
    --workspace=*)
      OPT_WORKSPACE="${1#--workspace=}"; shift ;;
    --workspace-repo)
      [ "$#" -ge 2 ] || die "--workspace-repo requires a git URL"
      OPT_WORKSPACE_REPO="$2"; shift 2 ;;
    --workspace-repo=*)
      OPT_WORKSPACE_REPO="${1#--workspace-repo=}"; shift ;;
    --port)
      [ "$#" -ge 2 ] || die "--port requires a number"
      OPT_PORT="$2"; shift 2 ;;
    --port=*)
      OPT_PORT="${1#--port=}"; shift ;;
    --gpu)
      [ "$#" -ge 2 ] || die "--gpu requires an argument (none|gpu|intel|wsl)"
      OPT_GPU="$2"; shift 2 ;;
    --gpu=*)
      OPT_GPU="${1#--gpu=}"; shift ;;
    --config)
      [ "$#" -ge 2 ] || die "--config requires a file path"
      CONFIG_FILE="$2"; INTERACTIVE="never"; shift 2 ;;
    --config=*)
      CONFIG_FILE="${1#--config=}"; INTERACTIVE="never"; shift ;;
    --non-interactive|-y)
      INTERACTIVE="never"; shift ;;
    --migrate)
      MIGRATE="yes"; shift ;;
    --no-migrate)
      MIGRATE="no"; shift ;;
    --dry-run)
      DRY_RUN="yes"; shift ;;
    --version)
      printf '%s\n' "${INSTALLER_VERSION}"; exit 0 ;;
    -h|--help)
      usage; exit 0 ;;
    *)
      err "unknown option: $1"
      usage >&2
      exit 2 ;;
  esac
done

if [ -n "${CONFIG_FILE}" ]; then
  load_config "${CONFIG_FILE}"
fi

# Validate anything supplied up front so mistakes surface before any prompting
# or Docker work happens.
if [ -n "${OPT_PORT}" ]; then
  validate_port "${OPT_PORT}" || exit 1
fi
if [ -n "${OPT_GPU}" ]; then
  validate_gpu "${OPT_GPU}" || exit 1
fi

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
