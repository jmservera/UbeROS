#!/bin/sh
# Generate compose.release.yaml from compose.yaml (Theme B, FR-B4/FR-B9).
#
# A release bundle ships no build contexts, so every service that compose.yaml
# builds from source must instead reference a PINNED image published by the
# release workflow (.github/workflows/release.yml). This script rewrites each
# `build:` block into `image: <namespace>/<service>:<version>` and leaves the
# rest of the file (networks, volumes, healthchecks, env) untouched so the two
# compose files never drift.
#
# It then runs the unpinned-tag guard (FR-B9): any `image:` reference without a
# tag, or pinned to a floating tag such as `latest`, fails the run.
#
# Usage:
#   sh scripts/gen-compose-release.sh <version>      # generate + guard
#   sh scripts/gen-compose-release.sh --check <file> # guard only
#
# POSIX sh + awk only (no yq/python dependency) so it runs on any CI runner.
set -eu

SCRIPT_DIR="$(CDPATH='' cd -- "$(dirname -- "$0")" && pwd -P)"
ROOT_DIR="$(CDPATH='' cd -- "${SCRIPT_DIR}/.." && pwd -P)"

SRC_COMPOSE="${ROOT_DIR}/compose.yaml"
OUT_COMPOSE="${ROOT_DIR}/compose.release.yaml"

# Must match IMAGE_NAMESPACE in .github/workflows/release.yml.
IMAGE_NAMESPACE="${UBEROS_IMAGE_NAMESPACE:-ghcr.io/jmservera/uberos}"

log() { printf '%s\n' "$*"; }
err() { printf 'error: %s\n' "$*" >&2; }
die() { err "$*"; exit 1; }

usage() {
  cat <<'EOF'
Usage:
  sh scripts/gen-compose-release.sh <version>
  sh scripts/gen-compose-release.sh --check <compose-file>

<version> may be given with or without a leading `v` (v0.4.0 == 0.4.0).
Override the registry namespace with UBEROS_IMAGE_NAMESPACE.
EOF
}

# FR-B9: reject any image reference that is not pinned. A reference is unpinned
# when it carries no tag at all (implicit :latest) or an explicitly floating tag
# (`latest`). Env-substituted tags such as ros:${ROS_DISTRO:-kilted} are pinned
# by .env and are allowed.
guard_unpinned() {
  file="$1"
  [ -f "${file}" ] || die "guard: ${file} not found"
  if ! awk '
    $1 == "image:" {
      ref = $2
      gsub(/"/, "", ref)
      # Drop any ${...} default-expansion so its inner ":" is not read as a tag
      # separator; what remains still shows whether a real tag was supplied.
      probe = ref
      gsub(/\$\{[^}]*\}/, "X", probe)
      # Only the last path segment can hold a tag. A ":" earlier in the
      # reference belongs to a registry host:port (localhost:5000/org/image),
      # which is still unpinned.
      last = probe
      sub(/.*\//, "", last)
      if (probe ~ /:latest$/ || last !~ /:/) {
        printf "  unpinned image reference on line %d: %s\n", NR, ref > "/dev/stderr"
        bad = 1
      }
    }
    END { exit bad ? 1 : 0 }
  ' "${file}"; then
    die "unpinned image references found in ${file}; pin every image to a release version"
  fi
  log "Guard passed: all image references in ${file} are pinned."
}

# --- Argument handling -------------------------------------------------------
case "${1:-}" in
  -h|--help) usage; exit 0 ;;
  --check)
    [ "$#" -ge 2 ] || die "--check requires a compose file path"
    guard_unpinned "$2"
    exit 0
    ;;
  '') usage >&2; exit 2 ;;
esac

VERSION="${1#v}"
[ -n "${VERSION}" ] || die "version must not be empty"
[ -f "${SRC_COMPOSE}" ] || die "${SRC_COMPOSE} not found"

# --- Generation --------------------------------------------------------------
# Replace every `build:` block under services with a pinned `image:` line. The
# service name doubles as the image name (it matches the release.yml matrix).
awk -v ns="${IMAGE_NAMESPACE}" -v ver="${VERSION}" '
  BEGIN { in_services = 0; svc = ""; skipping = 0 }

  # compose.yaml may be checked out with CRLF endings on Windows; normalize so
  # the anchored patterns below still match and the output stays LF-only.
  { sub(/\r$/, "") }

  # A column-0 key ends the previous top-level block.
  /^[A-Za-z]/ {
    in_services = ($0 ~ /^services:/) ? 1 : 0
    svc = ""
    skipping = 0
  }

  # Swallow the body of a build: block (anything indented deeper than the
  # service keys, which sit at four spaces).
  skipping == 1 {
    if ($0 ~ /^      /) { next }
    skipping = 0
  }

  # Service key: two spaces of indent directly under services:.
  in_services == 1 && /^  [A-Za-z0-9_.-]+:[ \t]*$/ {
    svc = $0
    sub(/^  /, "", svc)
    sub(/:[ \t]*$/, "", svc)
  }

  in_services == 1 && svc != "" && /^    build:[ \t]*$/ {
    printf "    image: %s/%s:%s\n", ns, svc, ver
    skipping = 1
    next
  }

  { print }
' "${SRC_COMPOSE}" > "${OUT_COMPOSE}.tmp" || die "failed to transform ${SRC_COMPOSE}"

# Prepend a provenance header so nobody hand-edits the generated file.
{
  printf '# GENERATED FILE - do not edit by hand.\n'
  printf '# Produced by scripts/gen-compose-release.sh for UbeROS %s.\n' "${VERSION}"
  printf '# Source: compose.yaml. Regenerate instead of patching.\n'
  cat "${OUT_COMPOSE}.tmp"
} > "${OUT_COMPOSE}"
rm -f "${OUT_COMPOSE}.tmp"

grep -q '^    build:' "${OUT_COMPOSE}" && die "build: sections remain in ${OUT_COMPOSE}"

log "Generated ${OUT_COMPOSE} for version ${VERSION} (namespace ${IMAGE_NAMESPACE})."
guard_unpinned "${OUT_COMPOSE}"
