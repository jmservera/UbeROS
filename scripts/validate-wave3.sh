#!/bin/sh
# Wave 3 validation harness (PR-7, PR-8, PR-11).
# Runs shell syntax checks, the release-compose generator, compose validation,
# and the unpinned-tag negative test. Exits non-zero on the first failure.
set -eu

cd "$(CDPATH='' cd -- "$(dirname -- "$0")/.." && pwd -P)"

pass() { printf 'PASS  %s\n' "$*"; }
fail() { printf 'FAIL  %s\n' "$*" >&2; exit 1; }

printf '== shell syntax ==\n'
for f in install.sh scripts/gen-compose-release.sh scripts/installer-wizard.sh scripts/provision-workspace.sh; do
  sh -n "$f" || fail "$f syntax"
  pass "$f syntax"
done

printf '\n== release compose generation ==\n'
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

printf '\n== unpinned-tag guard (negative test) ==\n'
tmp="$(mktemp)"
sed 's|\(ghcr.io/[^:]*\):0.0.0-validation|\1:latest|' compose.release.yaml > "$tmp"
if sh scripts/gen-compose-release.sh --check "$tmp" >/dev/null 2>&1; then
  rm -f "$tmp"
  fail "guard accepted a floating :latest tag"
fi
rm -f "$tmp"
pass "guard rejects floating :latest tags"

printf '\n== workspace provisioning ==\n'
sh scripts/provision-workspace.sh ensure >/dev/null || fail "provision ensure"
pass "provision-workspace.sh ensure"

printf '\nWave 3 validation: all checks passed.\n'
