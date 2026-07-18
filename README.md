# UberOS

> A browser-accessible ROS development and simulation environment on Docker Compose.

UberOS delivers a complete, containerized ROS 2 workspace — physics simulator,
browser code editor, terminals, and a canvas window manager — reachable from a
standard web browser with no local install beyond Docker.

![Screenshot of the UberOS window manager canvas with four panels: Simulator, Terminal, Code Editor, and ROS Status](docs/images/screenshot.png)

## Quick start

```bash
docker compose up
```

Then open <http://localhost:8080>. The window-manager canvas loads with four
panels: Simulator (noVNC), Terminal, Code Editor, and ROS Status.

To run detached:

```bash
docker compose up -d
```

To stop (volumes are preserved):

```bash
docker compose down
```

> **Warning:** `docker compose down -v` deletes the named volumes, including your
> ROS workspace build artifacts. Use plain `docker compose down` to keep data.

## Services

| Service | Purpose | Internal ports |
|---|---|---|
| `proxy` | Single ingress (Nginx); the only host-published port | 8080 |
| `frontend` | Svelte + Golden Layout window manager | 3000 |
| `ros` | ROS 2 middleware, rosbridge, ttyd terminals, colcon | 9090, 7681 |
| `simulator` | Gazebo + Xvfb (software rendering by default) | 5900, 6080 |
| `vnc` | x11vnc + noVNC sidecar (shares the simulator namespace) | 5900, 6080 |
| `editor` | code-server on the shared ROS workspace | 8443 |
| `control` | Operational control plane (per-service reset, workspace config) | 9000 |
| `discovery-server` | Fast DDS discovery (removes multicast dependency) | 11811 |

Only the proxy port is published to the host. Backend ports are reachable only
through the proxy.

## Configuration

Settings live in `.env` (committed defaults contain no secrets):

| Variable | Default | Purpose |
|---|---|---|
| `ROS_DISTRO` | `lyrical` | ROS 2 distribution (switch to `jazzy` as fallback) |
| `GZ_RELEASE` | `jetty` | Gazebo release (switch to `harmonic` with Jazzy) |
| `UBEROS_PORT` | `8080` | Host port for the proxy |
| `ROS_DOMAIN_ID` | `42` | DDS domain (cross-platform-safe range) |
| `UBEROS_AUTH` | `off` | Set to `basic` to enable proxy authentication |
| `UBEROS_SERVICES` | `ros,simulator,vnc,editor,frontend` | Services the system menu may reset |

### GPU acceleration (opt-in)

NVIDIA (Linux + NVIDIA Container Toolkit):

```bash
docker compose -f compose.yaml -f compose.override.gpu.yaml up
```

Intel iGPU/dGPU (Linux, `/dev/dri` passthrough — see
[docs/specs/03-intel-openvino-research.md](docs/specs/03-intel-openvino-research.md)):

```bash
docker compose -f compose.yaml -f compose.override.intel.yaml up
```

macOS Docker Desktop has no GPU passthrough; the default software-rendering
path is used there. Load only one GPU overlay at a time.

## Development loop

1. Edit a package in the **Code Editor** panel (`workspace/src/`).
2. In a **Terminal** panel: `cd /ros_ws && colcon build --symlink-install`.
3. `source install/setup.bash`, then `ros2 run <pkg> <node>`.
4. Observe the result in the **Simulator** and **ROS Status** panels.

## Security

Authentication is off by default for localhost. Before any non-localhost
exposure, enable it (NFR N-05) — no code edits required:

```bash
htpasswd -c config/nginx/.htpasswd admin
# set UBEROS_AUTH=basic in .env, then recreate the proxy
docker compose up -d --build proxy control
```

With auth enabled the workspace menu shows a **Logout** action that clears the
stored credentials and forces re-authentication.

## Documentation

- Project brief: [docs/specs/01-Init.md](docs/specs/01-Init.md)
- Research report: [docs/specs/01-Init-research.md](docs/specs/01-Init-research.md)
- PRD: [docs/prds/uberos-init.md](docs/prds/uberos-init.md)
- Decisions: [docs/decisions/](docs/decisions/)

> **Note:** The primary ROS distribution (Lyrical) is pending SPIKE-A image and
> package verification. See [ADR-001](docs/decisions/ADR-001-ros-distro.md).
> If verification fails, set `ROS_DISTRO=jazzy` and `GZ_RELEASE=harmonic`.
