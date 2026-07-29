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
# It then runs two guards:
#   * the unpinned-tag guard (FR-B9): any `image:` reference without a tag, or
#     pinned to one of the moving tags the release workflow republishes
#     (`latest`, `beta`), fails the run.
#   * the relative-mount guard (FR-C1): any host-relative bind mount whose
#     source is not shipped in the release bundle fails the run, because the
#     bundle has no source checkout to resolve it against.
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

# .github/workflows/release.yml passes its own IMAGE_NAMESPACE through as
# UBEROS_IMAGE_NAMESPACE, so the registry the images are pushed to and the one
# written into compose.release.yaml cannot drift apart. The literal below is
# only a convenience for local runs and must match the workflow's value.
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
# when it carries no tag at all (implicit :latest) or when it uses a moving tag.
# The moving tags are `latest` and `beta` -- release.yml republishes `:beta` on
# every pre-release, so a bundle pinned to it would change under the user's
# feet. Env-substituted tags such as ros:${ROS_DISTRO:-kilted} resolve from .env
# and are allowed. A pre-release *version* tag (`:0.4.0-beta`) is immutable and
# therefore fine; only the bare `:beta` suffix is rejected.
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
      if (probe ~ /:(latest|beta)$/ || last !~ /:/) {
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

# Paths the release bundle ships alongside compose.release.yaml (FR-C1). A
# host-relative bind mount is only safe when its source is one of these, because
# the extracted bundle then resolves it exactly like a source checkout does.
# Keep this list in sync with the bundle manifest in
# docs/prds/004-uberos-release-packaging.md.
BUNDLED_PATHS='./simulation ./config/nginx'

# A release bundle ships no source tree, so any host-relative bind mount that is
# NOT part of the bundle resolves to a path that does not exist after
# extraction. Docker then creates it as an empty directory and the service
# starts misconfigured -- an empty default.conf "directory" takes the proxy, and
# therefore the whole ingress, down. `docker compose config` never resolves
# mount sources, so it cannot catch this. Every such mount must be baked into
# its image, converted to a named volume, or added to the bundle manifest.
guard_relative_mounts() {
  file="$1"
  [ -f "${file}" ] || die "guard: ${file} not found"
  if ! awk -v bundled="${BUNDLED_PATHS}" '
    BEGIN { n = split(bundled, list, " ") }
    $1 == "-" && $2 ~ /^\.\// {
      mount = $2
      gsub(/"/, "", mount)
      src = mount
      sub(/:.*/, "", src)
      for (i = 1; i <= n; i++) {
        # Accept the bundled path itself and anything beneath it.
        if (src == list[i] || index(src, list[i] "/") == 1) next
      }
      printf "  unbundled host-relative bind mount on line %d: %s\n", NR, mount > "/dev/stderr"
      bad = 1
    }
    END { exit bad ? 1 : 0 }
  ' "${file}"; then
    die "unbundled host-relative bind mounts found in ${file}; a release bundle has no source tree to resolve them against (FR-C1) -- bake the path into the image, use a named volume, or add it to BUNDLED_PATHS and the bundle manifest"
  fi
  log "Guard passed: every host-relative bind mount in ${file} ships with the bundle."
}

# --- Argument handling -------------------------------------------------------
case "${1:-}" in
  -h|--help) usage; exit 0 ;;
  --check)
    [ "$#" -ge 2 ] || die "--check requires a compose file path"
    guard_unpinned "$2"
    guard_relative_mounts "$2"
    exit 0
    ;;
  '') usage >&2; exit 2 ;;
esac

VERSION="${1#v}"
[ -n "${VERSION}" ] || die "version must not be empty"
[ -f "${SRC_COMPOSE}" ] || die "${SRC_COMPOSE} not found"

# --- Generation --------------------------------------------------------------
# Replace every `build:` block under services with a pinned `image:` line. Core
# services use their Compose id as the image name; optional learning packages
# use an independent package image so they can evolve and publish separately.
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
    image = (svc == "turtlesim") ? "learning-turtlesim" : svc
    printf "    image: %s/%s:%s\n", ns, image, ver
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
guard_relative_mounts "${OUT_COMPOSE}"
