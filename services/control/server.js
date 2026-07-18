// UberOS control service — the workspace's operational control plane.
//
// Exposes a tiny, strictly-scoped HTTP API (behind the single Nginx proxy at
// /control/) that lets the frontend system menu:
//   - report which known services exist and their container health (BR-007)
//   - restart an INDIVIDUAL compose service without a full stack restart (BR-007)
//   - tell the SPA whether proxy auth is enabled so it can show Logout (BR-008)
//
// Security posture (this container mounts the Docker socket, so it is hardened):
//   - Only an ALLOWLIST of service names may ever be restarted; the name is
//     matched exactly against that list and used only as a Docker API label
//     filter — it is never interpolated into a shell.
//   - Only two Docker operations are ever issued: list containers (filtered to
//     this compose project) and restart a container by id. No exec, no create,
//     no arbitrary container control.
//   - The service is on the internal web_net only and is never host-published;
//     it is reachable solely through the proxy, where auth is enforced.
import http from 'node:http';
import { Buffer } from 'node:buffer';

const DOCKER_SOCKET = process.env.DOCKER_SOCKET || '/var/run/docker.sock';
const DOCKER_API = process.env.DOCKER_API_VERSION || 'v1.43';
const PROJECT = process.env.UBEROS_PROJECT || 'uberos';
const PORT = Number(process.env.CONTROL_PORT || 9000);
const AUTH = (process.env.UBEROS_AUTH || 'off').toLowerCase();

// Allowlist of compose services the menu may reset. Anything not in this set is
// rejected outright — the control plane can never touch itself, the proxy, or
// the discovery server.
const ALLOWED_SERVICES = (process.env.UBEROS_SERVICES || 'ros,simulator,vnc,editor,frontend')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);

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

    // POST /services/{name}/restart
    const restart = path.match(/^\/services\/([A-Za-z0-9_.-]+)\/restart$/);
    if (req.method === 'POST' && restart) {
      const name = restart[1];
      await restartService(name);
      return sendJson(res, 200, { restarted: name });
    }

    return sendJson(res, 404, { error: 'not found' });
  } catch (err) {
    return sendJson(res, err.statusCode || 500, { error: err.message || 'internal error' });
  }
});

server.listen(PORT, () => {
  // eslint-disable-next-line no-console
  console.log(`uberos control listening on :${PORT} (services: ${ALLOWED_SERVICES.join(', ')})`);
});
