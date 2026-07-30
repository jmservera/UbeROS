#!/bin/sh
# Measure UbeROS clean-host installation time (PRD 004 goal G-001).
#
# Runs a fresh, non-interactive install through install.sh and measures the
# wall-clock time from starting the installer to a browser-ready UI, then
# reports the total against the < 5 min target (G-001) with a phase breakdown:
#
#   * acquisition  = install.sh runtime (build or pull + create + start)
#   * health_wait  = time from install.sh returning to readiness
#   * total        = acquisition + health_wait (the G-001 number)
#
# Readiness mirrors tests/smoke.sh: the proxy /healthz endpoint returns 200 and
# every selected compose service reports healthy. The installer returns as soon
# as `compose up -d` returns (detached), so the health wait is measured here and
# not inside install.sh.
#
# A "clean host" (no cached images) is measured authentically on a fresh CI
# runner; --cold approximates it locally by tearing the stack down first. The
# default run is non-destructive: it never removes images or named volumes.
#
# Usage:
#   sh scripts/benchmark-install.sh [options]
#
# Options:
#   --mode <local|release>    Install mode (default: auto-detect via install.sh).
#   --port <port>             Host port for the proxy (default: 8080).
#   --gpu <none|nvidia|intel|wsl>
#                             GPU overlay to apply (default: none).
#   --workspace <path>        External workspace path (default: a temp dir).
#   --learning-packages <turtlesim|none>
#                             Learning-package selection (default: installer default).
#   --target-seconds <n>      Pass/over threshold in seconds (default: 300).
#   --cold                    Tear the stack down before timing (approx clean host).
#   --enforce                 Exit non-zero when total exceeds the target.
#   --timeout-seconds <n>     Max seconds to wait for readiness (default: 600).
#   -h, --help                Show this help and exit.
#
# POSIX sh only (no bashisms) so the benchmark runs on the widest range of hosts.
set -eu

SCRIPT_DIR="$(CDPATH='' cd -- "$(dirname -- "$0")" && pwd -P)"
ROOT_DIR="$(CDPATH='' cd -- "${SCRIPT_DIR}/.." && pwd -P)"

INSTALLER="${ROOT_DIR}/install.sh"

OPT_MODE=""
OPT_PORT="8080"
OPT_GPU="none"
OPT_WORKSPACE=""
OPT_LEARNING_PACKAGES=""
TARGET_SECONDS="300"
TIMEOUT_SECONDS="600"
COLD=""
ENFORCE=""

WORKSPACE_IS_TEMP=""

log() { printf '%s\n' "$*"; }
err() { printf 'error: %s\n' "$*" >&2; }
die() { err "$*"; exit 1; }

usage() {
  sed -n '2,45p' "$0" | sed 's/^# \{0,1\}//'
}

# Wrap docker compose the same way install.sh does (v2 plugin or legacy binary).
compose() {
  if docker compose version >/dev/null 2>&1; then
    docker compose "$@"
  elif command -v docker-compose >/dev/null 2>&1; then
    docker-compose "$@"
  else
    die "docker compose is required but was not found on PATH"
  fi
}

# Run docker compose with the mode/overlay compose file set applied, so health
# polling and teardown target exactly the services the installer started. The
# -f files are passed directly (not round-tripped through a string) so paths
# with spaces stay intact.
compose_stack() {
  case "${RESOLVED_MODE}" in
    local) _base="${ROOT_DIR}/compose.yaml" ;;
    release) _base="${ROOT_DIR}/compose.release.yaml" ;;
    *) die "unknown resolved mode: ${RESOLVED_MODE}" ;;
  esac
  if [ "${OPT_GPU}" != "none" ]; then
    case "${OPT_GPU}" in
      nvidia) _suffix="gpu" ;;
      *) _suffix="${OPT_GPU}" ;;
    esac
    compose -f "${_base}" -f "${ROOT_DIR}/compose.override.${_suffix}.yaml" "$@"
  else
    compose -f "${_base}" "$@"
  fi
}

now_seconds() {
  date +%s
}

# The selected services, minus turtlesim when learning packages are excluded,
# so a deselected package is not counted as an unhealthy service.
selected_services() {
  compose_stack config --services | while IFS= read -r _svc; do
    if [ "${_svc}" = "turtlesim" ] && [ "${OPT_LEARNING_PACKAGES}" = "none" ]; then
      continue
    fi
    printf '%s\n' "${_svc}"
  done
}

# True (0) when /healthz returns 200 and every selected service is healthy.
stack_ready() {
  _code="$(curl -fsS -o /dev/null -w '%{http_code}' \
    "http://localhost:${OPT_PORT}/healthz" 2>/dev/null || printf '000')"
  [ "${_code}" = "200" ] || return 1

  _health="$(compose_stack ps --format '{{.Service}}={{.Health}}' 2>/dev/null || true)"
  [ -n "${_health}" ] || return 1

  for _svc in $(selected_services); do
    case "${_health}" in
      *"${_svc}=healthy"*) : ;;
      *) return 1 ;;
    esac
  done
  return 0
}

cleanup() {
  if [ -n "${WORKSPACE_IS_TEMP}" ] && [ -n "${OPT_WORKSPACE}" ]; then
    rm -rf "${OPT_WORKSPACE}" 2>/dev/null || true
  fi
}
trap cleanup EXIT INT TERM

while [ "$#" -gt 0 ]; do
  case "$1" in
    --mode) [ "$#" -ge 2 ] || die "--mode requires local|release"; OPT_MODE="$2"; shift 2 ;;
    --mode=*) OPT_MODE="${1#--mode=}"; shift ;;
    --port) [ "$#" -ge 2 ] || die "--port requires a number"; OPT_PORT="$2"; shift 2 ;;
    --port=*) OPT_PORT="${1#--port=}"; shift ;;
    --gpu) [ "$#" -ge 2 ] || die "--gpu requires none|nvidia|intel|wsl"; OPT_GPU="$2"; shift 2 ;;
    --gpu=*) OPT_GPU="${1#--gpu=}"; shift ;;
    --workspace) [ "$#" -ge 2 ] || die "--workspace requires a path"; OPT_WORKSPACE="$2"; shift 2 ;;
    --workspace=*) OPT_WORKSPACE="${1#--workspace=}"; shift ;;
    --learning-packages)
      [ "$#" -ge 2 ] || die "--learning-packages requires turtlesim or none"
      OPT_LEARNING_PACKAGES="$2"; shift 2 ;;
    --learning-packages=*) OPT_LEARNING_PACKAGES="${1#--learning-packages=}"; shift ;;
    --target-seconds) [ "$#" -ge 2 ] || die "--target-seconds requires a number"; TARGET_SECONDS="$2"; shift 2 ;;
    --target-seconds=*) TARGET_SECONDS="${1#--target-seconds=}"; shift ;;
    --timeout-seconds) [ "$#" -ge 2 ] || die "--timeout-seconds requires a number"; TIMEOUT_SECONDS="$2"; shift 2 ;;
    --timeout-seconds=*) TIMEOUT_SECONDS="${1#--timeout-seconds=}"; shift ;;
    --cold) COLD="yes"; shift ;;
    --enforce) ENFORCE="yes"; shift ;;
    -h|--help) usage; exit 0 ;;
    *) err "unknown option: $1"; usage >&2; exit 2 ;;
  esac
done

[ -f "${INSTALLER}" ] || die "installer not found at ${INSTALLER}"
command -v curl >/dev/null 2>&1 || die "curl is required but was not found on PATH"

case "${TARGET_SECONDS}" in *[!0-9]*|'') die "--target-seconds must be a positive integer" ;; esac
case "${TIMEOUT_SECONDS}" in *[!0-9]*|'') die "--timeout-seconds must be a positive integer" ;; esac

# Resolve the effective mode for health polling: honor an explicit --mode,
# otherwise mirror install.sh's auto-detection (source checkout => local).
if [ -n "${OPT_MODE}" ]; then
  RESOLVED_MODE="${OPT_MODE}"
elif [ -d "${ROOT_DIR}/services" ] && [ -f "${ROOT_DIR}/compose.yaml" ]; then
  RESOLVED_MODE="local"
elif [ -f "${ROOT_DIR}/compose.release.yaml" ]; then
  RESOLVED_MODE="release"
else
  die "could not resolve install mode; pass --mode local|release"
fi

if [ -z "${OPT_WORKSPACE}" ]; then
  OPT_WORKSPACE="$(mktemp -d "${TMPDIR:-/tmp}/uberos-benchmark.XXXXXX")"
  WORKSPACE_IS_TEMP="yes"
fi

# Assemble the install.sh argument list from the provided options.
set -- --non-interactive --mode "${RESOLVED_MODE}" \
  --workspace "${OPT_WORKSPACE}" --port "${OPT_PORT}" --gpu "${OPT_GPU}"
if [ -n "${OPT_LEARNING_PACKAGES}" ]; then
  set -- "$@" --learning-packages "${OPT_LEARNING_PACKAGES}"
fi

if [ -n "${COLD}" ]; then
  log "Cold start: tearing down any existing stack..."
  compose_stack down --remove-orphans >/dev/null 2>&1 || true
fi

log "Benchmarking UbeROS install (mode=${RESOLVED_MODE}, port=${OPT_PORT}, gpu=${OPT_GPU})"
log "Target: ${TARGET_SECONDS}s | readiness timeout: ${TIMEOUT_SECONDS}s"

t0="$(now_seconds)"
sh "${INSTALLER}" "$@"
t1="$(now_seconds)"

log "Installer returned; waiting for the UI to become ready..."
_deadline=$(( t1 + TIMEOUT_SECONDS ))
while :; do
  if stack_ready; then
    break
  fi
  if [ "$(now_seconds)" -ge "${_deadline}" ]; then
    die "stack did not become ready within ${TIMEOUT_SECONDS}s after install"
  fi
  sleep 3
done
t2="$(now_seconds)"

acquisition=$(( t1 - t0 ))
health_wait=$(( t2 - t1 ))
total=$(( t2 - t0 ))

if [ "${total}" -le "${TARGET_SECONDS}" ]; then
  result="PASS"
else
  result="OVER"
fi

log ""
log "== UbeROS install benchmark =="
log "mode          : ${RESOLVED_MODE}"
log "acquisition   : ${acquisition}s (build/pull + create + start)"
log "health_wait   : ${health_wait}s (until /healthz + services healthy)"
log "total         : ${total}s"
log "target        : ${TARGET_SECONDS}s"
log "result        : ${result}"
log "benchmark: mode=${RESOLVED_MODE} acquisition=${acquisition}s health_wait=${health_wait}s total=${total}s target=${TARGET_SECONDS}s result=${result}"

if [ "${result}" = "OVER" ] && [ -n "${ENFORCE}" ]; then
  die "install took ${total}s, exceeding the ${TARGET_SECONDS}s target"
fi
