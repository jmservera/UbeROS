---
title: ÜbeROS
description: Browser-accessible ROS development and simulation environment running on Docker Compose.
author: UbeROS Team
ms.date: 2026-07-29
ms.topic: overview
---

## ÜbeROS

> A browser-accessible ROS development and simulation environment on Docker Compose.

![ÜbeROS logo](docs/images/logo.png)

UbeROS delivers a complete, containerized ROS 2 workspace, physics simulator,
browser code editor, terminals, and a canvas window manager, reachable from a
standard web browser with no local install beyond Docker.

![Screenshot of the UbeROS window manager canvas with four panels: Simulator, Terminal, Code Editor, and ROS Status](docs/images/screenshot.png)

## Quick start

The installer generates `.env`, creates a ROS workspace outside the checkout, and
starts the stack:

```bash
./install.sh
```

It asks for the workspace directory, the host port, and the GPU overlay, offering
a default for each. For an unattended setup, pass the answers instead:

```bash
./install.sh --non-interactive --workspace ~/uberos-workspace --port 8080 --gpu none
./install.sh --config answers.conf     # same keys, read from a KEY=VALUE file
./install.sh --learning-packages none  # omit the optional Turtlesim package
```

Re-running it is safe: your `.env` is kept and only the answers you change are
rewritten. `./install.sh --help` lists every flag.

If you would rather wire up `.env` yourself, the stack is still a plain compose
project:

```bash
docker compose up
```

Then open <http://localhost:8080>. The window-manager canvas loads with
Terminal, Code Editor, and ROS Status panels, plus a **Simulators** menu to
launch Gazebo (rendered in the browser via gzweb) or Turtlesim on demand.

To run detached:

```bash
docker compose up -d
```

To stop (volumes are preserved):

```bash
docker compose down
```

To rebuild the full stack and run tests in one line from the repository root:

```bash
docker compose down && docker compose build --parallel && docker compose up -d --remove-orphans && npm test --prefix tests
```

> **Warning:** `docker compose down -v` deletes the named volumes, including your
> ROS workspace build artifacts. Use plain `docker compose down` to keep data.

## Services

| Service | Purpose | Internal ports |
|---|---|---|
| `proxy` | Single ingress (Nginx); the only host-published port | 8080 |
| `frontend` | Svelte + Golden Layout window manager | 3000 |
| `ros` | ROS 2 middleware, rosbridge, ttyd terminals, colcon | 9090, 7681 |
| `gazebo` | Headless `gz sim -s` + gz-launch WebsocketServer (scene-state stream) + `ros_gz` bridge | 9002 |
| `gzweb-client` | Self-hosted gzweb web client (Three.js), served at `/gzweb/` | 3000 |
| `turtlesim` | Turtlesim + Xvfb + x11vnc + noVNC (GUI simulator over VNC) | 5900, 6080 |
| `editor` | code-server on the shared ROS workspace | 8443 |
| `control` | Operational control plane (service reset, simulator launch/stop, config) | 9000 |
| `discovery-server` | Fast DDS discovery (removes multicast dependency) | 11811 |

The simulator services (`gazebo`, `gzweb-client`, `turtlesim`) are always-on and
start with the stack; which simulators the menu offers is gated at runtime by
`UBEROS_SIMULATORS` (see [Simulator selection](#simulator-selection)).
Only the proxy port is published to the host. Backend ports are reachable only
through the proxy.

## Configuration

Settings live in `.env` (committed defaults contain no secrets):

| Variable | Default | Purpose |
|---|---|---|
| `ROS_DISTRO` | `kilted` | ROS 2 distribution (switch to `jazzy` as fallback) |
| `GZ_RELEASE` | `ionic` | Gazebo release (switch to `harmonic` with Jazzy) |
| `UBEROS_PORT` | `8080` | Host port for the proxy |
| `UBEROS_WORKSPACE` | `$HOME/uberos-workspace` | Host ROS workspace bind-mounted at `/ros_ws/src` |
| `UBEROS_GPU` | `none` | GPU overlay `install.sh` applies (`none`, `nvidia`, `intel`, `wsl`) |
| `UBEROS_LEARNING_PACKAGES` | `turtlesim` | Optional learning-package images and services selected by the installer (`turtlesim` or `none`) |
| `ROS_DOMAIN_ID` | `42` | DDS domain (cross-platform-safe range) |
| `UBEROS_AUTH` | `off` | Set to `basic` to enable proxy authentication |
| `UBEROS_SERVICES` | `ros,gazebo,editor,frontend` | Services the system menu may reset |
| `NPM_REGISTRY` | public npm | npm registry for image builds; point at a proxy in `.env` |

### Simulators (runtime)

Simulators are launched on demand from the **Simulators** menu and run
concurrently, each as its own container; they survive a browser reload (the
panel reconnects to the still-running simulator). By default both start with the
stack and can be stopped/relaunched from the menu.

| Simulator | Visualization | ROS integration |
|---|---|---|
| **Gazebo** | Browser 3D via `gzweb` (headless `gz sim -s` streams scene state over a WebSocket; no VNC) | `ros_gz` bridge, `/clock` bridged by default |
| **Turtlesim** | noVNC (Xvfb + x11vnc GUI window) | Native ROS 2 node (`/turtle1/cmd_vel`, `/turtle1/pose`) |

All simulators join the shared `ROS_DOMAIN_ID` through the Fast DDS discovery
server (no multicast).

### Simulator selection

Which simulators the menu offers is selected at runtime by a single setting in
`.env` (the default installs and shows **both** Gazebo and Turtlesim):

- `UBEROS_SIMULATORS`: comma-separated registry ids the control plane installs
  and the menu offers. Omit a simulator to exclude it: its menu entry disappears
  and its launch/stop requests are rejected. The simulator services are
  always-on (there are no compose profiles); this setting gates the registry and
  menu, not the build.

| Selection | `UBEROS_SIMULATORS` |
|---|---|
| Both (default) | `gazebo,turtlesim` *(or unset)* |
| Gazebo only | `gazebo` |
| Turtlesim only | `turtlesim` |

Verify the installed set with `curl -s http://localhost:8080/control/simulators`.

### Learning packages

The installer includes the Turtlesim learning package by default. Its image is
published independently as `ghcr.io/jmservera/uberos/learning-turtlesim` and is
selected with `UBEROS_LEARNING_PACKAGES=turtlesim`.

To install the core environment without learning packages, run:

```bash
./install.sh --learning-packages none
```

The installer then skips the Turtlesim image during local builds and release
pulls, omits its service from startup, removes an existing Turtlesim container,
and records `UBEROS_SIMULATORS=gazebo` so the menu exposes only installed
simulators. Re-run with `--learning-packages turtlesim` to add it later.

### GPU acceleration (opt-in)

NVIDIA (Linux + NVIDIA Container Toolkit):

```bash
docker compose -f compose.yaml -f compose.override.gpu.yaml up
```

Intel iGPU/dGPU (native Linux, `/dev/dri` passthrough, see
[docs/specs/03-intel-openvino-research.md](docs/specs/03-intel-openvino-research.md)):

```bash
docker compose -f compose.yaml -f compose.override.intel.yaml up
```

Windows (Docker Desktop / WSL2): the GPU is exposed as `/dev/dxg`, not
`/dev/dri`, so use the WSL overlay (vendor-neutral: Intel/AMD/NVIDIA):

```bash
docker compose -f compose.yaml -f compose.override.wsl.yaml up
```

macOS Docker Desktop has no GPU passthrough; the default software-rendering
path is used there. Load only one GPU overlay at a time.

## Development loop

1. Edit a package in the **Code Editor** panel (`workspace/src/`).
2. In a **Terminal** panel: `cd /ros_ws && colcon build --symlink-install`.
3. `source install/setup.bash`, then `ros2 run <pkg> <node>`.
4. Launch a simulator from the **Simulators** menu (Gazebo web view or
   Turtlesim) and observe the result there and in the **ROS Status** panel.

### Terminal copy and paste

The embedded terminal runs `ttyd` + `tmux`, so clipboard behavior follows both browser and tmux rules:

* Select text with left-click drag to copy from the terminal view.
* Right-click pastes the latest tmux buffer into the active shell.
* To paste from your host clipboard, use your browser/terminal shortcut while the terminal iframe is focused (`Ctrl+Shift+V` on most Linux/Windows setups, `Cmd+V` on macOS).

If a browser blocks clipboard access, use the keyboard shortcut again after granting clipboard permissions for the site.

### Measuring install time

UbeROS targets a first run under 5 minutes on a clean host (goal G-001). The
`scripts/benchmark-install.sh` harness runs a fresh non-interactive install and
reports the time to a browser-ready UI, split into acquisition (build or pull
plus start) and health-wait phases:

```bash
sh scripts/benchmark-install.sh --mode local
```

Pass `--target-seconds` to change the threshold, `--enforce` to exit non-zero
when the total exceeds it, and `--cold` to tear down an existing stack first. A
manual `Benchmark — Clean-Host Install` GitHub Actions workflow runs the same
harness on a fresh runner for an authentic cold-start measurement.

## Security

Authentication is off by default for localhost. Before any non-localhost
exposure, enable it (NFR N-05) with no code edits:

```bash
htpasswd -c config/nginx/.htpasswd admin
# set UBEROS_AUTH=basic in .env, then recreate the proxy
docker compose up -d --build proxy control
```

With auth enabled the workspace menu shows a **Logout** action that clears the
stored credentials and forces re-authentication.

## Platform support

UbeROS currently targets **x86_64** hosts (Linux, Windows via WSL2, and Intel
macOS), including the GPU overlays (`compose.override.{wsl,intel,gpu}.yaml`).

**ARM and Apple-silicon (arm64) are not yet supported.** We plan to cover them in
a later iteration and would welcome help: if you run on **Apple silicon** (M-series)
or other arm64 hardware, please try the stack and report what builds, what fails,
and any image/driver workarounds by opening an issue. Contributions and test
reports for Apple-silicon support are especially appreciated.

## Documentation

- Project brief: [docs/specs/01-Init.md](docs/specs/01-Init.md)
- Research report: [docs/specs/01-Init-research.md](docs/specs/01-Init-research.md)
- PRD (init): [docs/prds/001-uberos-init.md](docs/prds/001-uberos-init.md)
- Simulation & Visualization: [BRD](docs/brds/003-uberos-simulation-visualization-brd.md) · [PRD](docs/prds/003-uberos-simulation-visualization.md)
- Decisions: [docs/decisions/](docs/decisions/)

> **Note:** The primary ROS distribution (Kilted) passed SPIKE-A image and
> package verification. See [ADR-001](docs/decisions/ADR-001-ros-distro.md).
> Current implementation defaults are `ROS_DISTRO=kilted` and
> `GZ_RELEASE=ionic`. If a compatibility rollback is needed, set
> `ROS_DISTRO=jazzy` and `GZ_RELEASE=harmonic`.
