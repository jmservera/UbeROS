// UbeROS control service — the workspace's operational control plane.
//
// Exposes a tiny, strictly-scoped HTTP API (behind the single Nginx proxy at
// /control/) that lets the frontend system menu:
//   - report which known services exist and their container health (BR-007)
//   - restart an INDIVIDUAL compose service without a full stack restart (BR-007)
//   - tell the SPA whether proxy auth is enabled so it can show Logout (BR-008)
//   - read/write system-wide settings that persist across restarts (BR-CFG,
//     Theme C): stored server-side in a JSON file on a mounted volume, with a
//     reserved `user` key so per-user scoping can be added later (FR-C4).
//
// Security posture (this container mounts the Docker socket, so it is hardened):
//   - Only an ALLOWLIST of service names may ever be restarted; the name is
//     matched exactly against that list and used only as a Docker API label
//     filter — it is never interpolated into a shell.
//   - Simulator launch/stop (Theme B) is restricted to a SEPARATE allowlist
//     derived from the simulator registry (installedSimulators()); a launch/stop
//     id is validated against that registry and then mapped to a container id —
//     it never widens the restart allowlist and is never shelled out.
//   - Only these Docker operations are ever issued: list containers (filtered to
//     this compose project) and restart/start/stop a container by id. No exec,
//     no create, no arbitrary container control.
//   - Settings writes are validated against a strict whitelist (unknown keys
//     dropped, values type/enum-checked) and go only to a single fixed file
//     path — no path traversal, no shell.
//   - The service is on the internal web_net only and is never host-published;
//     it is reachable solely through the proxy, where auth is enforced.
import http from 'node:http';
import { Buffer } from 'node:buffer';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { dirname } from 'node:path';
import { installedSimulators } from './simulators.js';

const DOCKER_SOCKET = process.env.DOCKER_SOCKET || '/var/run/docker.sock';
const DOCKER_API = process.env.DOCKER_API_VERSION || 'v1.43';
const PROJECT = process.env.UBEROS_PROJECT || 'uberos';
const PORT = Number(process.env.CONTROL_PORT || 9000);
const AUTH = (process.env.UBEROS_AUTH || 'off').toLowerCase();

// Allowlist of compose services the menu may reset. Anything not in this set is
// rejected outright — the control plane can never touch itself, the proxy, or
// the discovery server.
const ALLOWED_SERVICES = (process.env.UBEROS_SERVICES || 'ros,gazebo,turtlesim,editor,frontend')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);

// System settings store (Theme C). Persisted server-side to a JSON file on a
// mounted volume so settings survive reloads AND container restarts (FR-C2).
const CONFIG_FILE = process.env.UBEROS_CONFIG_FILE || '/data/config.json';
const LAYOUT_KEYS = ['default', 'simulator', 'editor', 'terminal'];
const THEMES = ['dark', 'light'];
const DEFAULT_SETTINGS = Object.freeze({
  defaultLayout: 'default',
  simulatorAdapter: 'Intel',
  theme: 'dark',
  terminalAffinity: true,
});

// Whitelist + type/enum validation (FR-C3). Unknown keys are dropped and any
// invalid value falls back to its default, so a malformed payload can never
// corrupt the store or inject unexpected keys.
function sanitizeSettings(input) {
  const out = { ...DEFAULT_SETTINGS };
  if (input && typeof input === 'object') {
    if (LAYOUT_KEYS.includes(input.defaultLayout)) out.defaultLayout = input.defaultLayout;
    if (typeof input.simulatorAdapter === 'string' && input.simulatorAdapter.trim().length <= 64)
      out.simulatorAdapter = input.simulatorAdapter.trim();
    if (THEMES.includes(input.theme)) out.theme = input.theme;
    if (typeof input.terminalAffinity === 'boolean') out.terminalAffinity = input.terminalAffinity;
  }
  return out;
}

// Read the settings store, falling back to defaults if the file is missing or
// unreadable. The `user` key is reserved for future per-user scoping (FR-C4).
// `schemaVersion` is reserved for future config-store migrations (ADR-010,
// AE-O2) and is distinct from `version` (the data version).
async function readSettingsStore() {
  try {
    const parsed = JSON.parse(await readFile(CONFIG_FILE, 'utf8'));
    return {
      user: typeof parsed.user === 'string' ? parsed.user : 'default',
      version: 1,
      schemaVersion: typeof parsed.schemaVersion === 'number' ? parsed.schemaVersion : 1,
      settings: sanitizeSettings(parsed.settings),
    };
  } catch {
    return { user: 'default', version: 1, schemaVersion: 1, settings: { ...DEFAULT_SETTINGS } };
  }
}

// Validate and persist the settings store to the fixed file path.
async function writeSettingsStore(user, settings) {
  const store = {
    user: typeof user === 'string' && user.length <= 64 ? user : 'default',
    version: 1,
    // schemaVersion is reserved for future config-store migrations (ADR-010,
    // AE-O2); migration logic itself is still future work.
    schemaVersion: 1,
    settings: sanitizeSettings(settings),
  };
  await mkdir(dirname(CONFIG_FILE), { recursive: true });
  await writeFile(CONFIG_FILE, JSON.stringify(store, null, 2), 'utf8');
  return store;
}

// Read and JSON-parse a request body with a hard size cap (no external deps).
function readJsonBody(req, { limitBytes = 16 * 1024 } = {}) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on('data', (c) => {
      size += c.length;
      if (size > limitBytes) {
        req.destroy();
        reject(Object.assign(new Error('payload too large'), { statusCode: 413 }));
        return;
      }
      chunks.push(c);
    });
    req.on('end', () => {
      try {
        resolve(chunks.length ? JSON.parse(Buffer.concat(chunks).toString('utf8')) : {});
      } catch {
        reject(Object.assign(new Error('invalid json'), { statusCode: 400 }));
      }
    });
    req.on('error', reject);
  });
}

// Minimal Docker Engine API client over the unix socket (no external deps).
function dockerRequest(method, path, { timeoutMs = 60000 } = {}) {
  return new Promise((resolve, reject) => {
    const req = http.request(
      { socketPath: DOCKER_SOCKET, method, path: `/${DOCKER_API}${path}`, timeout: timeoutMs },
      (res) => {
        const chunks = [];
        res.on('data', (c) => chunks.push(c));
        res.on('end', () => {
          const body = Buffer.concat(chunks).toString('utf8');
          resolve({ status: res.statusCode, body });
        });
      }
    );
    req.on('timeout', () => req.destroy(new Error('docker request timed out')));
    req.on('error', reject);
    req.end();
  });
}

// List this project's containers, keyed by their compose service name.
async function listProjectContainers() {
  const filters = encodeURIComponent(
    JSON.stringify({ label: [`com.docker.compose.project=${PROJECT}`] })
  );
  const { status, body } = await dockerRequest('GET', `/containers/json?all=1&filters=${filters}`);
  if (status !== 200) throw new Error(`docker list failed (${status})`);
  const byService = new Map();
  for (const c of JSON.parse(body)) {
    const service = c.Labels?.['com.docker.compose.service'];
    if (service) byService.set(service, c);
  }
  return byService;
}

// Restart a single allowlisted service's container.
async function restartService(name) {
  if (!ALLOWED_SERVICES.includes(name)) {
    const err = new Error('service not allowed');
    err.statusCode = 403;
    throw err;
  }
  const containers = await listProjectContainers();
  const container = containers.get(name);
  if (!container) {
    const err = new Error('service not found');
    err.statusCode = 404;
    throw err;
  }
  const { status } = await dockerRequest('POST', `/containers/${container.Id}/restart`);
  if (status !== 204) throw new Error(`docker restart failed (${status})`);
}

// --- Simulator lifecycle (Theme B, FR-B2/B3/B7) ------------------------------
// Start/stop is restricted to an allowlist DERIVED FROM THE REGISTRY, not the
// UBEROS_SERVICES restart list: only the compose services backing an installed
// simulator (installedSimulators()) are ever eligible. The public {id} is the
// simulator's registry id (e.g. `gazebo`), validated against the registry; a
// match maps to the registry's compose `service`, which is resolved to a live
// container id. We then issue ONLY start/stop by container id — never create,
// never exec, and never a shell. This mirrors restartService()'s hardening.
async function resolveSimulatorContainer(id) {
  const sim = installedSimulators().find((s) => s.id === id);
  if (!sim) {
    // Unknown or disabled simulator id — rejected exactly like a non-allowlisted
    // restart target (FR-B7), so the socket surface can never be widened by a
    // crafted id.
    const err = new Error('simulator not allowed');
    err.statusCode = 403;
    throw err;
  }
  const containers = await listProjectContainers();
  const container = containers.get(sim.service);
  if (!container) {
    // The registry entry is valid but its container does not exist — the
    // `simulators` compose profile is inactive (FR-D/FR-B8). Distinct 404 so the
    // menu can tell "not installed at runtime" from "disallowed".
    const err = new Error('simulator not created');
    err.statusCode = 404;
    throw err;
  }
  return { sim, container };
}

// Start an installed simulator's container (FR-B2). Docker returns 204 when the
// container is started and 304 when it was already running; both are success so
// a double-launch is idempotent.
async function startSimulator(id) {
  const { container } = await resolveSimulatorContainer(id);
  const { status } = await dockerRequest('POST', `/containers/${container.Id}/start`);
  if (status !== 204 && status !== 304) throw new Error(`docker start failed (${status})`);
}

// Stop an installed simulator's container (FR-B3). 204 = stopped, 304 = already
// stopped; both succeed. `restart: unless-stopped` will NOT resurrect a
// container stopped this way, so a menu Stop stays stopped until a Launch.
async function stopSimulator(id) {
  const { container } = await resolveSimulatorContainer(id);
  const { status } = await dockerRequest('POST', `/containers/${container.Id}/stop`);
  if (status !== 204 && status !== 304) throw new Error(`docker stop failed (${status})`);
}

// Configurable auto-start at stack up (FR-B8). The `simulators` compose profile
// creates (and starts) every installed simulator; this best-effort reconcile
// then enforces each registry entry's `autostart` intent using only the same
// start/stop verbs: autostart-off simulators are stopped so they stay stopped
// until launched from the menu, and autostart-on simulators are (re)started if
// the profile left them down. Runs once shortly after boot to let compose finish
// creating containers; failures are swallowed so the menu still works manually.
async function reconcileAutostart() {
  let containers;
  try {
    containers = await listProjectContainers();
  } catch {
    return; // Docker unreachable at boot — the menu can still launch/stop later.
  }
  for (const sim of installedSimulators()) {
    const container = containers.get(sim.service);
    if (!container) continue; // profile inactive for this simulator; nothing to do.
    const running = container.State === 'running';
    try {
      if (sim.autostart && !running) {
        await dockerRequest('POST', `/containers/${container.Id}/start`);
      } else if (!sim.autostart && running) {
        await dockerRequest('POST', `/containers/${container.Id}/stop`);
      }
    } catch {
      // One simulator failing to reconcile must not block the others (NFR-REL-2).
    }
  }
}

async function serviceStatus() {
  let containers = new Map();
  try {
    containers = await listProjectContainers();
  } catch {
    // Report the allowlist as unknown rather than failing the whole menu.
  }
  return ALLOWED_SERVICES.map((name) => {
    const c = containers.get(name);
    return {
      name,
      state: c?.State ?? 'unknown',
      status: c?.Status ?? 'unknown',
      health: /\(healthy\)/.test(c?.Status ?? '')
        ? 'healthy'
        : /\(unhealthy\)/.test(c?.Status ?? '')
          ? 'unhealthy'
          : 'unknown',
    };
  });
}

// Collapse a Docker container's raw State/Status into the simulator lifecycle
// vocabulary the PRD defines (§7.1): available (installed but not launched),
// starting, running, stopped, failed, unknown. Derived read-only from the same
// container list serviceStatus() uses — no launch/stop here (that is Theme B).
function simulatorState(container) {
  if (!container) return 'available';
  const state = container.State ?? '';
  const status = container.Status ?? '';
  if (state === 'running') {
    if (/\(health: starting\)/.test(status)) return 'starting';
    if (/\(unhealthy\)/.test(status)) return 'failed';
    return 'running';
  }
  if (state === 'created' || state === 'restarting') return 'starting';
  if (state === 'exited') return /Exited \(0\)/.test(status) ? 'stopped' : 'failed';
  if (state === 'dead') return 'failed';
  return 'unknown';
}

// Installed simulators (FR-A1) enriched with live container state (FR-A2).
// Maps each entry's compose `service` to a container via listProjectContainers()
// exactly like serviceStatus(); a missing container reads as `available`.
async function simulatorStatus() {
  let containers = new Map();
  let dockerReachable = true;
  try {
    containers = await listProjectContainers();
  } catch {
    // Report the registry with unknown state rather than failing the menu.
    dockerReachable = false;
  }
  return installedSimulators().map((sim) => ({
    ...sim,
    state: dockerReachable ? simulatorState(containers.get(sim.service)) : 'unknown',
  }));
}

function sendJson(res, status, payload) {
  const body = JSON.stringify(payload);
  res.writeHead(status, {
    'Content-Type': 'application/json',
    'Cache-Control': 'no-store',
    'Content-Length': Buffer.byteLength(body),
  });
  res.end(body);
}

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, 'http://control');
    const path = url.pathname.replace(/\/+$/, '') || '/';

    // Liveness for the container healthcheck.
    if (req.method === 'GET' && (path === '/health' || path === '/')) {
      return sendJson(res, 200, { status: 'ok' });
    }

    // Config the SPA needs at boot: is auth on, and what can be reset.
    if (req.method === 'GET' && path === '/config') {
      return sendJson(res, 200, {
        auth: AUTH === 'off' || AUTH === 'none' || AUTH === '' ? 'off' : AUTH,
        services: ALLOWED_SERVICES,
      });
    }

    if (req.method === 'GET' && path === '/services') {
      return sendJson(res, 200, { services: await serviceStatus() });
    }

    // Installed simulators + live state (FR-A2). Read-only; launch/stop lands
    // in Theme B. Mirrors the /services shape so the SPA menu stays uniform.
    if (req.method === 'GET' && path === '/simulators') {
      return sendJson(res, 200, { simulators: await simulatorStatus() });
    }

    // System settings store (Theme C). GET returns the persisted settings (or
    // defaults); PUT validates and persists them so they survive a restart.
    if (req.method === 'GET' && path === '/config/settings') {
      return sendJson(res, 200, await readSettingsStore());
    }
    if (req.method === 'PUT' && path === '/config/settings') {
      const body = await readJsonBody(req);
      return sendJson(res, 200, await writeSettingsStore(body?.user, body?.settings));
    }

    // POST /services/{name}/restart
    const restart = path.match(/^\/services\/([A-Za-z0-9_.-]+)\/restart$/);
    if (req.method === 'POST' && restart) {
      const name = restart[1];
      await restartService(name);
      return sendJson(res, 200, { restarted: name });
    }

    // POST /simulators/{id}/launch — start an installed simulator (FR-B2). The
    // id is allowlisted against the registry (403 if unknown), and its container
    // must exist (404 if the `simulators` profile is inactive).
    const simLaunch = path.match(/^\/simulators\/([A-Za-z0-9_.-]+)\/launch$/);
    if (req.method === 'POST' && simLaunch) {
      const id = simLaunch[1];
      await startSimulator(id);
      return sendJson(res, 200, { launched: id });
    }

    // POST /simulators/{id}/stop — stop an installed simulator (FR-B3), same
    // registry-derived allowlist and error contract as launch.
    const simStop = path.match(/^\/simulators\/([A-Za-z0-9_.-]+)\/stop$/);
    if (req.method === 'POST' && simStop) {
      const id = simStop[1];
      await stopSimulator(id);
      return sendJson(res, 200, { stopped: id });
    }

    return sendJson(res, 404, { error: 'not found' });
  } catch (err) {
    return sendJson(res, err.statusCode || 500, { error: err.message || 'internal error' });
  }
});

server.listen(PORT, () => {
  // eslint-disable-next-line no-console
  console.log(`uberos control listening on :${PORT} (services: ${ALLOWED_SERVICES.join(', ')})`);
  // Honor per-simulator autostart intent once compose has had a moment to create
  // the simulator containers (FR-B8). Best-effort; never blocks serving.
  setTimeout(() => {
    reconcileAutostart().catch(() => {});
  }, Number(process.env.UBEROS_AUTOSTART_DELAY_MS || 3000));
});
