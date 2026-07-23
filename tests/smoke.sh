#!/usr/bin/env bash
# UbeROS Layer-1 curl smoke test (WP-15).
# Verifies the single-ingress proxy routes to every backend and that S1 health
# holds. Intended for CI and quick local checks; the browser criteria (S2-S6)
# are covered by the Playwright suite in ./acceptance.
set -euo pipefail

PORT="${UBEROS_PORT:-8080}"
BASE="http://localhost:${PORT}"
fail=0

echo "== S1: service health =="
docker compose ps --format '{{.Service}} -> {{.Health}}'
if docker compose ps --format '{{.Service}}={{.Health}}' | grep -vq '=healthy'; then
  # grep -v returns 0 if any non-healthy line exists.
  if docker compose ps --format '{{.Service}}={{.Health}}' | grep -q '=[^h]'; then
    echo "ERROR: at least one service is not healthy" >&2
    fail=1
  fi
fi

# route -> expected acceptable HTTP status codes (space separated)
check() {
  local path="$1"; shift
  local code
  code="$(curl -s -o /dev/null -w '%{http_code}' "${BASE}${path}")"
  for expected in "$@"; do
    if [[ "${code}" == "${expected}" ]]; then
      echo "OK   ${path} -> ${code}"
      return 0
    fi
  done
  echo "FAIL ${path} -> ${code} (expected: $*)" >&2
  fail=1
}

echo "== proxy routing =="
check /healthz 200
check / 200
check /gzweb/ 200
check /terminal/ 200
check /editor/ 200 302

if [[ "${fail}" -ne 0 ]]; then
  echo "SMOKE FAILED" >&2
  exit 1
fi
echo "SMOKE OK"
