// Shared helpers for the acceptance suite: docker compose introspection and
// pixel analysis used to machine-verify criteria that touch container state.
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
export const REPO_ROOT = resolve(__dirname, '..', '..');

export const SERVICES = [
  'discovery-server',
  'ros',
  'gazebo',
  'gzweb-client',
  'turtlesim',
  'editor',
  'frontend',
  'control',
  'proxy',
];

// Return a { service: health } map from `docker compose ps`.
export function healthSnapshot() {
  const raw = execFileSync(
    'docker',
    ['compose', 'ps', '--format', '{{.Service}}={{.Health}}'],
    { cwd: REPO_ROOT, encoding: 'utf8' }
  );
  const map = {};
  for (const line of raw.trim().split(/\r?\n/).filter(Boolean)) {
    const [svc, health] = line.split('=');
    map[svc] = health;
  }
  return map;
}

// Run a command inside a compose service container and return stdout.
export function execInService(service, shellCommand) {
  return execFileSync(
    'docker',
    ['compose', 'exec', '-T', service, 'sh', '-c', shellCommand],
    { cwd: REPO_ROOT, encoding: 'utf8' }
  );
}

// Ensure an on-demand simulator's compose service is running before a test that
// streams it. Simulators live behind the `simulators` compose profile and may
// be created-but-stopped (autostart off) or not yet up; this brings the named
// service up idempotently so the noVNC/gzweb stream has a live backend. Returns
// the service health once `docker compose up` settles.
export function ensureSimulatorRunning(service) {
  execFileSync(
    'docker',
    ['compose', '--profile', 'simulators', 'up', '-d', service],
    { cwd: REPO_ROOT, encoding: 'utf8' }
  );
  return healthSnapshot()[service];
}

export async function getSimulators(request) {
  const res = await request.get('/control/simulators');
  if (!res.ok()) {
    throw new Error(`GET /control/simulators failed with status ${res.status()}`);
  }
  const body = await res.json();
  return body.simulators ?? [];
}

export async function pollSimulatorState(
  request,
  id,
  states,
  timeoutMs = 90_000,
  intervalMs = 2_000
) {
  const deadline = Date.now() + timeoutMs;
  let last = 'missing';

  while (Date.now() < deadline) {
    const sims = await getSimulators(request);
    last = sims.find((s) => s.id === id)?.state ?? 'missing';
    if (states.includes(last)) {
      return last;
    }
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }

  return last;
}

export async function waitForNoVncRoute(
  request,
  path,
  timeoutMs = 45_000,
  intervalMs = 2_000
) {
  const deadline = Date.now() + timeoutMs;
  let lastStatus = 0;

  while (Date.now() < deadline) {
    const res = await request.get(path);
    lastStatus = res.status();
    if (lastStatus === 200) {
      return lastStatus;
    }
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }

  return lastStatus;
}

export async function ensureSimulatorNoVncReady(
  request,
  id,
  noVncPath,
  timeoutMs = 210_000
) {
  ensureSimulatorRunning(id);
  const deadline = Date.now() + timeoutMs;

  // Ask the control plane to launch the simulator in case it was intentionally
  // stopped by prior lifecycle tests in the same full-suite run.
  const launch = await request.post(`/control/simulators/${id}/launch`);
  if (![200, 404].includes(launch.status())) {
    throw new Error(
      `POST /control/simulators/${id}/launch failed with status ${launch.status()}`
    );
  }

  const state = await pollSimulatorState(
    request,
    id,
    ['starting', 'running'],
    Math.max(0, deadline - Date.now())
  );
  if (!['starting', 'running'].includes(state)) {
    throw new Error(`Simulator ${id} did not reach starting/running; last state: ${state}`);
  }

  const noVncStatus = await waitForNoVncRoute(request, noVncPath, Math.max(0, deadline - Date.now()));
  if (noVncStatus !== 200) {
    throw new Error(`${noVncPath} did not become ready; last status: ${noVncStatus}`);
  }
}

// Poll a noVNC canvas until more than `threshold` of pixels are non-black or the
// deadline passes. Returns the best observed non-black ratio.
export async function pollNonBlackRatio(page, timeoutMs, threshold) {
  const deadline = Date.now() + timeoutMs;
  let best = 0;
  while (Date.now() < deadline) {
    const ratio = await page.evaluate(() => {
      const canvas =
        document.querySelector('#noVNC_canvas') || document.querySelector('canvas');
      if (!canvas || !canvas.width || !canvas.height) return 0;
      const ctx = canvas.getContext('2d');
      if (!ctx) return 0;
      const { data } = ctx.getImageData(0, 0, canvas.width, canvas.height);
      let nonBlack = 0;
      const total = data.length / 4;
      for (let i = 0; i < data.length; i += 4) {
        // Treat near-black as black to ignore compression noise.
        if (data[i] > 16 || data[i + 1] > 16 || data[i + 2] > 16) nonBlack++;
      }
      return total ? nonBlack / total : 0;
    });
    if (ratio > best) best = ratio;
    if (ratio > threshold) return ratio;
    await page.waitForTimeout(1000);
  }
  return best;
}
