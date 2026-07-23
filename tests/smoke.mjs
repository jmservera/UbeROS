// Cross-platform Layer-1 smoke runner (WP-15) — a curl-equivalent using fetch.
// Mirrors smoke.sh for environments without bash/curl (e.g. Windows dev hosts).
import { execFileSync } from 'node:child_process';

const PORT = process.env.UBEROS_PORT || '8080';
const BASE = process.env.UBEROS_BASE_URL || `http://localhost:${PORT}`;

let failed = false;

function log(ok, msg) {
  console.log(`${ok ? 'OK  ' : 'FAIL'} ${msg}`);
  if (!ok) failed = true;
}

// S1: service health via docker compose.
try {
  const raw = execFileSync('docker', ['compose', 'ps', '--format', '{{.Service}}={{.Health}}'], {
    encoding: 'utf8',
  });
  console.log('== S1: service health ==');
  for (const line of raw.trim().split(/\r?\n/).filter(Boolean)) {
    const [svc, health] = line.split('=');
    log(health === 'healthy', `${svc} -> ${health}`);
  }
} catch (err) {
  log(false, `docker compose ps failed: ${err.message}`);
}

// Proxy routing checks (path -> acceptable status codes).
const routes = [
  ['/healthz', [200]],
  ['/', [200]],
  ['/gzweb/', [200]],
  // Turtlesim noVNC is profile-gated: 200 when running, 502 when profile is off.
  ['/sim/turtlesim/novnc/', [200, 502]],
  ['/terminal/', [200]],
  ['/editor/', [200, 302]],
];

console.log('== proxy routing ==');
for (const [path, expected] of routes) {
  try {
    const res = await fetch(`${BASE}${path}`, { redirect: 'manual' });
    log(expected.includes(res.status), `${path} -> ${res.status} (expected ${expected.join('/')})`);
  } catch (err) {
    log(false, `${path} -> error ${err.message}`);
  }
}

if (failed) {
  console.error('SMOKE FAILED');
  process.exit(1);
}
console.log('SMOKE OK');
