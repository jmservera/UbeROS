#!/bin/sh
# Wave 3 validation harness (PR-7 installer wizard, PR-8 workspace provisioning,
# PR-11 release-compose generator).
#
# Covers the Wave 3 success criteria:
#   * accepting defaults completes setup, a config file installs silently, and
#     invalid port/path/overlay values are rejected with actionable errors
#   * a fresh install creates an external workspace and migration preserves
#     content without deleting the source
#   * the generated compose.release.yaml has no build contexts, pins every
#     service image, validates with docker compose, mounts nothing that the
#     release bundle does not ship, and the unpinned-tag guard rejects moving
#     tags
#
# Installer flows run inside a disposable sandbox (a copy of install.sh plus a
# stub compose.yaml) so the harness never touches the developer's .env or
# workspace. Exits non-zero on the first failure.
set -eu

# The installer reads UBEROS_WORKSPACE from the environment. Clear it so the
# results do not depend on whatever the developer happens to have exported.
unset UBEROS_WORKSPACE || true

REPO="$(CDPATH='' cd -- "$(dirname -- "$0")/.." && pwd -P)"
cd "${REPO}"

SANDBOX=""
# The generator writes compose.release.yaml into the repo root. Remember whether
# the developer already had one so a validation run never leaves a stray
# artifact (or clobbers theirs) behind.
RELEASE_COMPOSE="${REPO}/compose.release.yaml"
RELEASE_COMPOSE_BACKUP=""
[ -f "${RELEASE_COMPOSE}" ] && RELEASE_COMPOSE_BACKUP="${RELEASE_COMPOSE}.validate-bak"
[ -n "${RELEASE_COMPOSE_BACKUP}" ] && cp "${RELEASE_COMPOSE}" "${RELEASE_COMPOSE_BACKUP}"

cleanup() {
  [ -n "${SANDBOX}" ] && rm -rf "${SANDBOX}"
  if [ -n "${RELEASE_COMPOSE_BACKUP}" ]; then
    mv "${RELEASE_COMPOSE_BACKUP}" "${RELEASE_COMPOSE}"
  else
    rm -f "${RELEASE_COMPOSE}"
  fi
}
trap cleanup EXIT INT TERM

pass() { printf 'PASS  %s\n' "$*"; }
fail() { printf 'FAIL  %s\n' "$*" >&2; exit 1; }

# Assert that a command fails and that its combined output mentions $1.
expect_failure() {
  _needle="$1"; shift
  if out="$("$@" 2>&1)"; then
    fail "expected failure from: $* (needle: ${_needle})"
  fi
  case "${out}" in
    *"${_needle}"*) return 0 ;;
    *) fail "error message missing '${_needle}': ${out}" ;;
  esac
}

printf '== shell syntax ==\n'
for f in install.sh scripts/gen-compose-release.sh scripts/validate-wave3.sh; do
  sh -n "$f" || fail "$f syntax"
  pass "$f syntax"
done

# --- Installer sandbox -------------------------------------------------------
SANDBOX="$(mktemp -d "${TMPDIR:-/tmp}/uberos-wave3.XXXXXX")"
INSTALL_ROOT="${SANDBOX}/checkout"
mkdir -p "${INSTALL_ROOT}/services" "${INSTALL_ROOT}/workspace/src/demo_pkg"
cp install.sh .env.template "${INSTALL_ROOT}/"
cp compose.override.gpu.yaml compose.override.intel.yaml compose.override.wsl.yaml \
  "${INSTALL_ROOT}/"
printf 'services: {}\n' > "${INSTALL_ROOT}/compose.yaml"
printf '# demo\n' > "${INSTALL_ROOT}/workspace/src/demo_pkg/package.xml"
INSTALL="${INSTALL_ROOT}/install.sh"

printf '\n== installer CLI (FR-D2, FR-G4) ==\n'
sh "${INSTALL}" --version >/dev/null || fail "--version"
pass "--version"
sh "${INSTALL}" --help | grep -q -- '--non-interactive' || fail "--help lists --non-interactive"
pass "--help"
expect_failure 'unknown option' sh "${INSTALL}" --bogus
pass "unknown option rejected"

printf '\n== input validation (FR-E4) ==\n'
expect_failure 'invalid port' sh "${INSTALL}" -y --port 70000 --dry-run
pass "out-of-range port rejected"
expect_failure 'invalid port' sh "${INSTALL}" -y --port abc --dry-run
pass "non-numeric port rejected"
expect_failure 'invalid GPU overlay' sh "${INSTALL}" -y --gpu amd --dry-run
pass "unknown GPU overlay rejected"
expect_failure 'must be an absolute path' \
  sh "${INSTALL}" -y --workspace relative/path --dry-run
pass "relative workspace rejected"
expect_failure 'inside the source checkout' \
  sh "${INSTALL}" -y --workspace "${INSTALL_ROOT}/inside" --dry-run
pass "workspace inside the checkout rejected"
expect_failure "unknown key 'NOPE'" sh -c "
  printf 'NOPE=1\n' > '${SANDBOX}/bad.conf'
  sh '${INSTALL}' --config '${SANDBOX}/bad.conf' --dry-run
"
pass "unknown config key rejected"

# An existing, writable workspace must be accepted even when its parent is not
# writable (a user-owned /opt/uberos-workspace under a root-owned /opt): nothing
# has to be created in the parent. Root ignores permission bits, so the check
# would prove nothing there.
if [ "$(id -u)" -ne 0 ]; then
  RO_PARENT="${SANDBOX}/ro-parent"
  mkdir -p "${RO_PARENT}/ws/src"
  chmod a-w "${RO_PARENT}"
  if sh "${INSTALL}" -y --workspace "${RO_PARENT}/ws" --no-migrate --dry-run >/dev/null 2>&1; then
    chmod u+w "${RO_PARENT}"
  else
    chmod u+w "${RO_PARENT}"
    fail "existing workspace under a non-writable parent was rejected"
  fi
  rm -f "${INSTALL_ROOT}/.env"
  pass "existing workspace accepted under a non-writable parent"

  # The flip side: relaxing the parent check must not make the validation
  # toothless. A workspace the user cannot write to is still a hard error.
  RO_WS="${SANDBOX}/ro-ws"
  mkdir -p "${RO_WS}"
  chmod a-w "${RO_WS}"
  if sh "${INSTALL}" -y --workspace "${RO_WS}" --no-migrate --dry-run >/dev/null 2>&1; then
    chmod u+w "${RO_WS}"
    fail "a non-writable workspace was accepted"
  fi
  chmod u+w "${RO_WS}"
  rm -f "${INSTALL_ROOT}/.env"
  pass "non-writable existing workspace still rejected"
else
  pass "existing workspace under a non-writable parent (skipped: running as root)"
  pass "non-writable existing workspace rejected (skipped: running as root)"
fi

printf '\n== silent install from a config file (FR-E2, FR-F2) ==\n'
WS="${SANDBOX}/ws"
cat > "${SANDBOX}/answers.conf" <<EOF
UBEROS_WORKSPACE=${WS}
UBEROS_PORT=9090
UBEROS_GPU=none
UBEROS_MIGRATE=yes
EOF
sh "${INSTALL}" --config "${SANDBOX}/answers.conf" --dry-run >/dev/null \
  || fail "config-file install"
[ -d "${WS}/src" ] || fail "workspace src not created"
pass "external workspace created at ${WS}/src"
grep -q "^UBEROS_WORKSPACE=${WS}$" "${INSTALL_ROOT}/.env" || fail ".env workspace"
grep -q '^UBEROS_PORT=9090$' "${INSTALL_ROOT}/.env" || fail ".env port"
pass ".env written with the configured answers"
[ "$(grep -c '^UBEROS_WORKSPACE=' "${INSTALL_ROOT}/.env")" -eq 1 ] \
  || fail "duplicate UBEROS_WORKSPACE keys in .env"
[ "$(grep -c '^UBEROS_PORT=' "${INSTALL_ROOT}/.env")" -eq 1 ] \
  || fail "duplicate UBEROS_PORT keys in .env"
pass "no duplicate keys in the generated .env"

printf '\n== workspace migration (FR-F4) ==\n'
[ -f "${WS}/src/demo_pkg/package.xml" ] || fail "migration did not copy demo_pkg"
pass "repo-local workspace copied into the external workspace"
[ -f "${INSTALL_ROOT}/workspace/src/demo_pkg/package.xml" ] \
  || fail "migration deleted the source workspace"
pass "source workspace left untouched"

# A populated target must never be merged into, not even with --migrate: tar
# extraction would silently replace same-path files.
WS_FULL="${SANDBOX}/ws-populated"
mkdir -p "${WS_FULL}/src/mine"
printf 'keep me\n' > "${WS_FULL}/src/mine/package.xml"
sh "${INSTALL}" -y --workspace "${WS_FULL}" --migrate --dry-run >/dev/null \
  || fail "install into a populated workspace"
[ "$(cat "${WS_FULL}/src/mine/package.xml")" = 'keep me' ] \
  || fail "migration overwrote an existing workspace file"
[ ! -e "${WS_FULL}/src/demo_pkg" ] \
  || fail "migration merged into a populated workspace"
pass "populated workspace never merged into, even with --migrate"

# A copy that fails part-way must not leave a partial workspace behind: the
# emptiness guard above would then refuse to retry the migration, stranding the
# user with half their packages. An unreadable source file makes tar fail.
if [ "$(id -u)" -ne 0 ]; then
  BAD_ROOT="${SANDBOX}/checkout-unreadable"
  mkdir -p "${BAD_ROOT}/services" "${BAD_ROOT}/workspace/src/demo_pkg"
  cp install.sh .env.template "${BAD_ROOT}/"
  printf 'services: {}\n' > "${BAD_ROOT}/compose.yaml"
  printf '# demo\n' > "${BAD_ROOT}/workspace/src/demo_pkg/package.xml"
  printf '# secret\n' > "${BAD_ROOT}/workspace/src/demo_pkg/unreadable.xml"
  chmod 000 "${BAD_ROOT}/workspace/src/demo_pkg/unreadable.xml"
  WS_FAIL="${SANDBOX}/ws-failed"
  if sh "${BAD_ROOT}/install.sh" -y --workspace "${WS_FAIL}" --migrate --dry-run >/dev/null 2>&1; then
    chmod 644 "${BAD_ROOT}/workspace/src/demo_pkg/unreadable.xml"
    fail "migration reported success despite an unreadable source file"
  fi
  chmod 644 "${BAD_ROOT}/workspace/src/demo_pkg/unreadable.xml"
  [ -d "${WS_FAIL}/src" ] || fail "rollback removed ${WS_FAIL}/src instead of emptying it"
  [ -z "$(ls -A "${WS_FAIL}/src" 2>/dev/null || true)" ] \
    || fail "failed migration left a partial copy in ${WS_FAIL}/src"
  pass "failed migration rolls back the partial copy"
else
  pass "failed migration rollback (skipped: running as root)"
fi

printf '\n== defaults accepted non-interactively (FR-E1) ==\n'
rm -f "${INSTALL_ROOT}/.env"
HOME="${SANDBOX}/home" && mkdir -p "${HOME}"
HOME="${HOME}" sh "${INSTALL}" -y --no-migrate --dry-run >/dev/null || fail "default install"
[ -d "${SANDBOX}/home/uberos-workspace/src" ] || fail "default workspace not created"
grep -q '^UBEROS_PORT=8080$' "${INSTALL_ROOT}/.env" || fail "default port not applied"
pass "defaults produce a complete setup"

printf '\n== re-run preserves hand-edited .env values ==\n'
sh "${INSTALL}" -y --port 7000 --workspace "${SANDBOX}/keep" --no-migrate --dry-run >/dev/null \
  || fail "install with explicit port"
HOME="${SANDBOX}/home" sh "${INSTALL}" -y --no-migrate --dry-run >/dev/null || fail "re-run"
grep -q '^UBEROS_PORT=7000$' "${INSTALL_ROOT}/.env" \
  || fail "re-run reset the configured port back to the default"
grep -q "^UBEROS_WORKSPACE=${SANDBOX}/keep$" "${INSTALL_ROOT}/.env" \
  || fail "re-run reset the configured workspace back to the default"
pass "re-running the installer keeps the existing port and workspace"

printf '\n== unset HOME fails with guidance (FR-E4) ==\n'
rm -f "${INSTALL_ROOT}/.env"
expect_failure 'workspace path is empty' env -u HOME sh "${INSTALL}" -y --dry-run
pass "missing HOME reports how to recover"

printf '\n== paths with shell-special characters ==\n'
rm -f "${INSTALL_ROOT}/.env"
ODD="${SANDBOX}/w s&p|e"
sh "${INSTALL}" -y --workspace "${ODD}" --no-migrate --dry-run >/dev/null \
  || fail "install with special characters in the workspace path"
grep -q "^UBEROS_WORKSPACE=${ODD}$" "${INSTALL_ROOT}/.env" \
  || fail ".env corrupted by special characters"
pass "workspace path with & and | written verbatim"

printf '\n== answer precedence (CLI > --config > environment) ==\n'
rm -f "${INSTALL_ROOT}/.env"
UBEROS_WORKSPACE="${SANDBOX}/from-env" \
  sh "${INSTALL}" -y --no-migrate --dry-run >/dev/null \
  || fail "install with an exported UBEROS_WORKSPACE"
grep -q "^UBEROS_WORKSPACE=${SANDBOX}/from-env$" "${INSTALL_ROOT}/.env" \
  || fail "exported UBEROS_WORKSPACE was ignored"
pass "an exported UBEROS_WORKSPACE is used when nothing else supplies one"

rm -f "${INSTALL_ROOT}/.env"
cat > "${SANDBOX}/override.conf" <<EOF
UBEROS_WORKSPACE=${SANDBOX}/from-config
UBEROS_MIGRATE=no
EOF
UBEROS_WORKSPACE="${SANDBOX}/from-env" \
  sh "${INSTALL}" --config "${SANDBOX}/override.conf" --dry-run >/dev/null \
  || fail "install with both an exported workspace and a config file"
grep -q "^UBEROS_WORKSPACE=${SANDBOX}/from-config$" "${INSTALL_ROOT}/.env" \
  || fail "exported UBEROS_WORKSPACE silently overrode the --config answer"
pass "--config overrides an exported UBEROS_WORKSPACE"

rm -f "${INSTALL_ROOT}/.env"
UBEROS_WORKSPACE="${SANDBOX}/from-env" \
  sh "${INSTALL}" --config "${SANDBOX}/override.conf" --workspace "${SANDBOX}/from-cli" --dry-run >/dev/null \
  || fail "install with a CLI workspace plus a config file"
grep -q "^UBEROS_WORKSPACE=${SANDBOX}/from-cli$" "${INSTALL_ROOT}/.env" \
  || fail "--workspace did not win over --config"
pass "--workspace overrides --config"

printf '\n== GPU overlay contract (FR-D5) and persistence (FR-D6) ==\n'
rm -f "${INSTALL_ROOT}/.env"
sh "${INSTALL}" -y --workspace "${SANDBOX}/gpu-ws" --gpu nvidia --no-migrate --dry-run >/dev/null \
  || fail "PRD CLI name --gpu nvidia was rejected"
grep -q '^UBEROS_GPU=nvidia$' "${INSTALL_ROOT}/.env" || fail "UBEROS_GPU not persisted"
pass "--gpu nvidia accepted and recorded in .env"

sh "${INSTALL}" -y --no-migrate --dry-run >/dev/null || fail "re-run after --gpu nvidia"
grep -q '^UBEROS_GPU=nvidia$' "${INSTALL_ROOT}/.env" \
  || fail "re-run silently dropped the GPU overlay back to none"
pass "re-running the installer keeps the configured GPU overlay"

sh "${INSTALL}" -y --gpu gpu --no-migrate --dry-run >/dev/null \
  || fail "legacy --gpu gpu alias was rejected"
pass "legacy --gpu gpu alias still accepted"

# --- Release compose generator (PR-11) ---------------------------------------
printf '\n== release compose generation (FR-B4) ==\n'
sh scripts/gen-compose-release.sh v0.0.0-validation >/dev/null || fail "generator"
pass "generated compose.release.yaml"

grep -q '^    build:' compose.release.yaml && fail "build: sections remain"
pass "no build: sections in compose.release.yaml"

expected=8
found="$(grep -c 'ghcr.io/.*:0.0.0-validation' compose.release.yaml)"
[ "$found" -eq "$expected" ] || fail "expected $expected pinned service images, found $found"
pass "$found services pinned to the release version"

docker compose -f compose.release.yaml config >/dev/null || fail "docker compose config"
pass "docker compose -f compose.release.yaml config"

printf '\n== unpinned-tag guard (FR-B9, negative tests) ==\n'
tmp="${SANDBOX}/guard.yaml"
sed 's|\(ghcr.io/[^:]*\):0.0.0-validation|\1:latest|' compose.release.yaml > "$tmp"
expect_failure 'unpinned image reference' sh scripts/gen-compose-release.sh --check "$tmp"
pass "guard rejects floating :latest tags"

sed 's|ghcr.io/\([^:]*\):0.0.0-validation|localhost:5000/\1|' compose.release.yaml > "$tmp"
expect_failure 'unpinned image reference' sh scripts/gen-compose-release.sh --check "$tmp"
pass "guard rejects a tagless registry:port reference"

# release.yml republishes :beta on every pre-release, so a bundle pinned to it
# would change under the user's feet. The immutable :<version>-beta tag must
# still be accepted.
sed 's|\(ghcr.io/[^:]*\):0.0.0-validation|\1:beta|' compose.release.yaml > "$tmp"
expect_failure 'unpinned image reference' sh scripts/gen-compose-release.sh --check "$tmp"
pass "guard rejects the moving :beta tag"

sed 's|\(ghcr.io/[^:]*\):0.0.0-validation|\1:0.4.0-beta|' compose.release.yaml > "$tmp"
sh scripts/gen-compose-release.sh --check "$tmp" >/dev/null \
  || fail "guard rejected an immutable pre-release version tag"
pass "guard accepts an immutable :0.4.0-beta version tag"

sh scripts/gen-compose-release.sh --check compose.release.yaml >/dev/null \
  || fail "guard rejected a fully pinned file"
pass "guard accepts the generated file"

printf '\n== bundle self-containment guard (FR-C1) ==\n'
# A release bundle ships no source tree, so a bind mount pointing at a path that
# is not in the bundle would be created by Docker as an empty directory and the
# service would start misconfigured. `docker compose config` cannot catch this.
grep -q '^      - \./services/' compose.release.yaml \
  && fail "compose.release.yaml still mounts a path from the source tree"
pass "no source-tree bind mounts in compose.release.yaml"

sed 's|^\(      - \)\./simulation:.*|\1./services/proxy/nginx.conf:/etc/nginx/conf.d/default.conf:ro|' \
  compose.release.yaml > "$tmp"
expect_failure 'unbundled host-relative bind mount' sh scripts/gen-compose-release.sh --check "$tmp"
pass "guard rejects a bind mount that the bundle does not ship"

# Paths under a bundled directory stay legal: the bundle reproduces the layout.
sed 's|^\(      - \)\./simulation:.*|\1./simulation/worlds:/simulation/worlds:ro|' \
  compose.release.yaml > "$tmp"
sh scripts/gen-compose-release.sh --check "$tmp" >/dev/null \
  || fail "guard rejected a mount nested under a bundled path"
pass "guard accepts a mount nested under a bundled path"

printf '\nWave 3 validation: all checks passed.\n'
