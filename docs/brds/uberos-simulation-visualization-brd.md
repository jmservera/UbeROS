---
title: UbeROS Simulation and Visualization BRD
description: Business requirements for a pluggable, build-configurable simulator/visualizer framework with a runtime launch menu, Turtlesim as a second visualizer, full ROS 2 integration for simulators, and moving Gazebo from VNC to native web visualization.
author: jmservera
ms.date: 07/21/2026
ms.topic: concept
---

# UbeROS Simulation and Visualization BRD

Version 0.2.0 | Status Draft | Owner jmservera | Related [Workspace Enhancements BRD](./uberos-workspace-enhancements-brd.md) · [Workspace Management BRD](./uberos-workspace-management-brd.md) · [uberos-init PRD](../prds/uberos-init.md)

## Progress Tracker

| Phase | Done | Gaps | Updated |
|-------|------|------|---------|
| Context | 90% | New initiative framing confirmed; ties to Enhancements BRD Theme E (GPU spike) | 2026-07-20 |
| Problem & Drivers | 90% | Four themes confirmed: pluggability, launch menu, ROS integration, web viz | 2026-07-20 |
| Objectives & Metrics | 100% | Web client (gzweb), <300ms latency, concurrency, and persistence confirmed; no image-size budget set | 2026-07-21 |
| Stakeholders | 80% | Owner jmservera, delivery Squad; per-requirement reviewers TODO | 2026-07-20 |
| Scope | 95% | Separate-container architecture, concurrent + persistent simulators confirmed | 2026-07-21 |
| Requirements | 100% | gzweb, latency, concurrency, reload-survival, and /clock default bridge confirmed | 2026-07-21 |

## 1. Business Context and Background

UbeROS delivers a browser-based ROS development environment through a Golden Layout canvas of
dockable panels (Simulator/noVNC, Terminal, Code Editor, ROS Status) behind a single Nginx
proxy. Today the only simulator is Gazebo: the `simulator` service starts an Xvfb framebuffer on
display `:99` and launches `gz sim`, and a `vnc` sidecar (x11vnc + noVNC) shares the simulator's
network namespace to stream that display to the browser
([services/simulator/entrypoint.sh](../../services/simulator/entrypoint.sh),
[compose.yaml](../../compose.yaml)).

Two facts from the current codebase shape this BRD:

- **Simulation is single, static, and not launch-selectable.** Gazebo is the only visualizer, it
  is baked into a dedicated service, and there is no way to add another simulator (for example
  Turtlesim) or to choose which simulator to run without rebuilding a different stack.
- **Gazebo is streamed, not integrated.** The simulator is presented as a pixel stream over VNC,
  and the Gazebo world is not bridged into ROS 2 as first-class nodes/topics — so the simulator
  is a viewer rather than a participant in the ROS graph. The related
  [Workspace Enhancements BRD](./uberos-workspace-enhancements-brd.md) Theme E already documents
  that this VNC path falls back to software (llvmpipe) rendering on WSL2 Intel GPUs, making it
  slow.

This BRD captures the business need for a **pluggable, build-configurable simulator/visualizer
framework** with a **runtime launch menu**, adds **Turtlesim** as a second visualizer, requires
**full ROS 2 integration** for simulators, and moves **Gazebo from VNC to native web
visualization** so heavy computation stays server-side (GPU-eligible) while rendering happens in
the browser.

## 2. Problem Statement and Business Drivers

### Problem Statement

Operators can run only one hard-wired simulator (Gazebo), cannot choose or add simulators at
runtime, and get Gazebo as a slow VNC pixel stream that is not wired into the ROS 2 graph as
nodes and topics. There is no menu to launch the available simulators, no build-time control over
which simulators are installed, and no lightweight visualizer (like Turtlesim) for teaching or
quick tests. This limits what can be demonstrated, hurts simulator performance, and prevents the
simulator from participating in ROS workflows.

### Business Drivers

| Driver | Description |
|--------|-------------|
| Extensibility | A simulator/visualizer framework lets new simulators be added without reworking the stack. |
| Runtime flexibility | Operators should pick and launch a simulator on demand, not commit to one at stack build. |
| Build-time footprint control | Deployments should install only the simulators they need to keep images lean. |
| ROS-native simulation | Simulators must appear in the ROS 2 graph (nodes/topics/services) so they participate in real workflows, not just render pixels. |
| Simulation performance | Move Gazebo off the software-rendered VNC path to GPU-eligible server-side compute with web-based rendering. |
| Teaching and quick tests | A lightweight visualizer (Turtlesim) supports onboarding, demos, and CLI-tool tutorials. |

## 3. Business Objectives and Success Metrics

| Objective ID | Objective | KPI / Success Metric | Baseline | Target | Priority |
|--------------|-----------|----------------------|----------|--------|----------|
| BO-1 | Pluggable simulator/visualizer framework | New simulators register through a defined contract without editing core UI/service code | One hard-wired Gazebo service | Registry-driven simulators; adding one is additive | Must |
| BO-2 | Runtime simulator launch menu | A menu lists available simulators and launches/stops them on demand | No launch menu; Gazebo always-on | Menu launches any installed simulator | Must |
| BO-3 | Turtlesim as a second visualizer | Turtlesim launches from the menu, renders in a panel, and appears in the ROS graph | No Turtlesim | Turtlesim runs (via VNC) and is ROS-visible | Must |
| BO-4 | Build-time simulator selection | A build option selects which simulators are installed; Gazebo + Turtlesim are the defaults | Gazebo only, not selectable | Configurable install set, sensible defaults | Must |
| BO-5 | ROS 2 integration for simulators | Launched simulators expose nodes/topics/services in the ROS 2 graph (Gazebo via `ros_gz` bridge) | Gazebo not bridged to ROS 2 | Simulator topics visible and usable from ROS tooling | Must |
| BO-6 | Gazebo native web visualization | Gazebo renders through the `gzweb` web client instead of VNC, with compute server-side and interaction lag under 300ms | VNC pixel stream, software rendering (~1s lag) | Web-rendered Gazebo via `gzweb`, lag < 300ms; VNC path retired for Gazebo | Must |
| BO-7 | Concurrent, session-persistent simulators | Multiple simulators run at once and survive a browser page reload | Single always-on Gazebo tied to the stack | Concurrent simulators; server-side lifecycle survives reload | Must |

## 4. Stakeholders and Roles

| Stakeholder | Role | Interest |
|-------------|------|----------|
| jmservera | Product owner / sponsor | Prioritizes work, accepts deliverables |
| ROS Developer (primary persona) | End user | Choosing simulators, ROS-graph integration, sim performance |
| Educator / Demo presenter | End user | Turtlesim for tutorials and onboarding |
| Platform Maintainer | Operator | Build-time install set, GPU overlays, image footprint |
| Squad | Delivery team | Design and implementation |

> TODO: Confirm the reviewer/owner for each requirement theme.

## 5. Scope

### In Scope

- A pluggable simulator/visualizer framework: a registry/contract that describes each available
  simulator (id, display name, launch command, panel/visualization type, ROS integration) so
  simulators can be added without editing core code.
- A runtime **launch menu** listing available simulators (Gazebo, Turtlesim, and future
  additions) that starts and stops a simulator on demand and shows its state.
- **Concurrent simulators**: more than one simulator (for example Gazebo and Turtlesim) can run at
  the same time, each in its own panel and in the ROS graph.
- **Session persistence**: a launched simulator runs server-side and survives a browser page
  reload (the panel reconnects to the still-running simulator), consistent with the terminal
  persistence model.
- Each simulator runs in its **own container/service** (Gazebo exposes a websocket streaming
  service; Turtlesim needs the VNC/X11 display), launched on demand rather than as a single
  always-on service.
- **Turtlesim** as a second visualizer, launched from the menu, rendered through the existing
  VNC/X11 display path (Turtlesim needs a GUI window), and visible in the ROS 2 graph.
- **Build-time selection** of which simulators are installed, with **Gazebo and Turtlesim as the
  defaults**.
- **ROS 2 integration** for simulators so each launched simulator participates in the ROS graph;
  for Gazebo this means the `ros_gz` bridge per the
  [Gazebo ionic ROS 2 integration overview](https://gazebosim.org/docs/ionic/ros2_overview/).
- **Gazebo web visualization**: replace the Gazebo VNC path with Gazebo's native web
  visualization (the [gazebo-web/gzweb](https://github.com/gazebo-web/gzweb) client) so simulation
  compute stays server-side (GPU-eligible) and rendering happens in the browser, per the
  [Gazebo ionic web visualization docs](https://gazebosim.org/docs/ionic/web_visualization/).

### Out of Scope

- Removing the VNC/noVNC path entirely — it is retained for Turtlesim and any other GUI-window
  simulator; only **Gazebo** moves off VNC.
- Building a full multi-user simulation model (concurrent isolated simulator instances per user);
  the framework must not preclude it but does not deliver it here.
- Replacing Golden Layout, the single-reverse-proxy topology, or the ROS middleware/discovery
  design.
- Solving the WSL2 Intel GPU rendering blocker itself — that remains the
  [Workspace Enhancements BRD](./uberos-workspace-enhancements-brd.md) Theme E spike; this BRD's
  web-visualization move is a complementary path that shifts rendering to the browser.

### Assumptions

- The existing `vnc` sidecar (x11vnc + noVNC on the shared `:99` display) remains available for
  GUI-window simulators such as Turtlesim.
- Each simulator runs in its own container/service, launched on demand by the control service;
  Gazebo streams via its websocket service and Turtlesim renders through the VNC/X11 display.
- Simulators run against the existing ROS 2 middleware and Fast DDS discovery server; launched
  simulators join the same `ROS_DOMAIN_ID`.
- Gazebo's web visualization (`gzweb`) can be served behind the single Nginx ingress at the same
  origin, consistent with the ports-internal topology.
- Init constraints hold: single ingress, backend ports internal, single-user now with multi-user
  not precluded.

## 6. Current and Future Business Processes

### Current State

- The `simulator` service always runs Gazebo (`gz sim`) on an Xvfb `:99` display; there is no way
  to select a different simulator or to not run Gazebo.
- The `vnc` sidecar streams display `:99` to the browser via noVNC; Gazebo is presented as a pixel
  stream, and on WSL2 Intel it renders in software (llvmpipe).
- Gazebo is not bridged into ROS 2: its entities/topics are not exposed as ROS 2 topics/services,
  so ROS tooling cannot see or drive the simulation.
- There is no launch menu and no build-time control over which simulators are installed.

### Future State

The simulator launch menu and per-simulator lifecycle described below are target
state requirements and are not yet implemented in the current stack.

- A simulator registry describes the available simulators; a launch menu lists them (Gazebo,
  Turtlesim, and future additions) and starts/stops them on demand, showing status.
- Build configuration selects which simulators are installed, defaulting to Gazebo + Turtlesim.
- Each simulator runs in its own container/service, launched on demand; more than one can run
  concurrently, and a launched simulator survives a browser reload (the panel reconnects).
- Turtlesim launches from the menu, renders through the VNC/X11 display, and appears as ROS 2
  nodes/topics.
- Gazebo launches from the menu, is bridged into ROS 2 through `ros_gz` (nodes/topics/services
  visible to ROS tooling), and renders through the `gzweb` web client rather than VNC, keeping
  compute server-side with interaction lag under 300ms.
- Each launched simulator is a first-class participant in the ROS 2 graph.

## 7. Business Requirements

Requirement IDs use a theme prefix. Priority uses MoSCoW.

### 7.1 Theme A — Pluggable simulator/visualizer framework

| ID | Requirement | Priority |
|----|-------------|----------|
| BR-SIM-1 | Provide a simulator registry/contract that declares each simulator's id, display name, launch/stop commands, visualization type (web vs VNC/X11 window), and ROS integration. | Must |
| BR-SIM-2 | Adding a new simulator must be additive (register + install), without editing the launch menu or core services by hand for each new simulator. | Must |
| BR-SIM-3 | The framework must support at least two visualization transports: Gazebo-style web visualization and VNC/X11-window visualization (for Turtlesim and similar GUI apps). | Must |
| BR-SIM-4 | Each launched simulator must join the existing ROS 2 domain/discovery so it participates in the same ROS graph. | Must |
| BR-SIM-5 | Each simulator runs in its own container/service, launched on demand by the control service, rather than as a single always-on simulator service. | Must |
| BR-SIM-6 | Multiple simulators can run concurrently (for example Gazebo and Turtlesim at the same time), each with its own panel and ROS entities. | Must |
| BR-SIM-7 | A launched simulator runs server-side and survives a browser page reload; the panel reconnects to the still-running simulator (consistent with terminal persistence). | Must |

Acceptance criteria:

- A registry entry exists for Gazebo and for Turtlesim, and a third (placeholder/example) can be
  added by registration + install alone.
- Launching either simulator makes it visible in the ROS 2 graph on the shared domain.
- Gazebo and Turtlesim can run at the same time; reloading the browser reconnects both panels to
  the still-running simulators without restarting them.

### 7.2 Theme B — Runtime simulator launch menu

| ID | Requirement | Priority |
|----|-------------|----------|
| BR-MENU-1 | The UI provides a menu listing the simulators available in the current build (for example Gazebo, Turtlesim). | Must |
| BR-MENU-2 | The menu can launch a selected simulator on demand and stop a running one. | Must |
| BR-MENU-3 | The menu reflects each simulator's state (available, starting, running, stopped/failed). | Should |
| BR-MENU-4 | Launching a simulator opens or routes its visualization to the appropriate panel (web-viz panel for Gazebo, VNC panel for Turtlesim). | Must |
| BR-MENU-5 | Only simulators installed in the current build appear in the menu. | Must |
| BR-MENU-6 | The menu supports multiple simulators running at once and reflects the state of each independently. | Must |

Acceptance criteria:

- The menu lists exactly the installed simulators; selecting one launches it and its panel shows
  the running simulator.
- Stopping a simulator from the menu terminates it and updates its state; ROS graph entries for it
  are removed.
- With Gazebo and Turtlesim both running, the menu shows both as running and each can be stopped
  independently.

### 7.3 Theme C — Turtlesim visualizer

| ID | Requirement | Priority |
|----|-------------|----------|
| BR-TS-1 | Turtlesim is installable and launchable as a simulator, rendered through the VNC/X11 display path (it requires a GUI window). | Must |
| BR-TS-2 | A launched Turtlesim exposes its standard ROS 2 nodes/topics/services (for example `/turtle1/cmd_vel`, `/turtle1/pose`) in the graph. | Must |
| BR-TS-3 | Turtlesim can be driven from a terminal panel (for example teleop) while visible in its panel. | Should |

Acceptance criteria:

- Launching Turtlesim shows the turtle window in a panel; `ros2 topic list` shows the Turtlesim
  topics; publishing to `/turtle1/cmd_vel` moves the turtle.

### 7.4 Theme D — Build-time simulator selection

| ID | Requirement | Priority |
|----|-------------|----------|
| BR-BLD-1 | A build-time configuration option selects which simulators are installed into the image(s). | Must |
| BR-BLD-2 | The default build installs Gazebo and Turtlesim. | Must |
| BR-BLD-3 | Excluding a simulator at build time keeps it out of both the image and the runtime menu. | Must |
| BR-BLD-4 | The build option is documented (compose/build args or equivalent) with the default and how to change it. | Should |

Acceptance criteria:

- A default build produces a stack whose menu offers Gazebo and Turtlesim.
- A build configured to exclude Turtlesim produces an image without it and a menu that does not
  list it.

### 7.5 Theme E — ROS 2 integration for simulators

| ID | Requirement | Priority |
|----|-------------|----------|
| BR-ROS-1 | Gazebo is integrated with ROS 2 via the `ros_gz` bridge per the [Gazebo ionic ROS 2 integration overview](https://gazebosim.org/docs/ionic/ros2_overview/), exposing simulation topics/services to ROS tooling. | Must |
| BR-ROS-2 | A default topic bridge for `/clock` (`rosgraph_msgs/Clock`) is configured so ROS nodes run on simulation time immediately after launch; additional per-world/model bridges are added as worlds are introduced. | Should |
| BR-ROS-3 | Simulator ROS entities appear on the shared `ROS_DOMAIN_ID` and are visible in the ROS Status panel / `ros2` CLI. | Must |
| BR-ROS-4 | The integration must not require multicast (must work through the existing Fast DDS discovery server). | Must |

Acceptance criteria:

- After launching Gazebo, `ros2 topic list` shows bridged simulation topics and the ROS Status
  panel reflects the simulator's nodes.

> Resolved: only `/clock` is bridged by default; further topic bridges are added per world/model as
> new worlds are introduced.

### 7.6 Theme F — Gazebo native web visualization (replaces VNC for Gazebo)

| ID | Requirement | Priority |
|----|-------------|----------|
| BR-WEB-1 | Gazebo renders through the [gazebo-web/gzweb](https://github.com/gazebo-web/gzweb) web client per the [Gazebo ionic web visualization docs](https://gazebosim.org/docs/ionic/web_visualization/), served behind the single ingress. | Must |
| BR-WEB-2 | Gazebo no longer uses the VNC/noVNC path; the VNC path is retained only for GUI-window simulators such as Turtlesim. | Must |
| BR-WEB-3 | Simulation computation stays server-side (GPU-eligible) while rendering is performed by the browser web client. | Must |
| BR-WEB-4 | The Gazebo web visualization loads in a Golden Layout panel and behaves like other panels (dock, pop-out, collapse). | Should |
| BR-WEB-5 | Interaction lag on the Gazebo web path is under 300ms (versus the ~1s software-rendered VNC baseline). | Must |

Acceptance criteria:

- Launching Gazebo shows the world in a `gzweb` web-visualization panel (not a VNC frame);
  interacting with the view works from the browser.
- The Gazebo pipeline no longer depends on x11vnc/noVNC; Turtlesim still uses the VNC path.
- Measured interaction lag on the Gazebo web path is under 300ms.

## 8. Dependencies and Constraints

- Turtlesim visualization depends on the existing `vnc` sidecar and shared `:99` X11 display.
- Each simulator runs in its own container/service launched on demand by the control service;
  Gazebo exposes a websocket streaming service and Turtlesim uses the VNC/X11 display.
- Gazebo web visualization depends on the `gzweb` client and Gazebo's websocket/transport bridge
  being reachable behind the single Nginx ingress at the same origin (ports-internal topology
  preserved).
- ROS 2 integration depends on `ros_gz` packages matching the Gazebo release (`GZ_RELEASE`, e.g.
  `ionic`) and ROS distro (`ROS_DISTRO`), and on the Fast DDS discovery server (no multicast).
- Session persistence depends on the control service tracking simulator processes server-side so a
  panel can reconnect after reload.
- Build-time selection must not break the existing GPU overlays
  (`compose.override.{wsl,intel,gpu}.yaml`) or the native-Linux path.
- The GPU-rendering blocker on WSL2 Intel remains the Enhancements BRD Theme E spike; this BRD's
  web-visualization move is complementary, shifting rendering to the browser.

## 9. Open Questions

1. Web-visualization component — Resolved: adopt the [gazebo-web/gzweb](https://github.com/gazebo-web/gzweb)
   client for Gazebo, served behind the proxy (route/design captured in the follow-on PRD).
2. Default bridged topics — Resolved: only `/clock` (`rosgraph_msgs/Clock`) is bridged by default;
   additional per-world/model bridges are added as new worlds are introduced.
3. Launch orchestration — Resolved: each simulator runs in its own container/service, launched on
   demand by the control service (not processes inside one always-on simulator service).
4. Simulator lifecycle vs stack lifecycle — Resolved: a launched simulator runs server-side and
   survives a browser page reload; the panel reconnects to the still-running simulator.
5. Performance target — Resolved: interaction lag under 300ms on the Gazebo web path (versus the
   ~1s software-rendered VNC baseline).
6. Multi-simulator concurrency — Resolved: simulators can run concurrently (for example Gazebo and
   Turtlesim at the same time).

## 10. Handoffs and Next Steps

- Validate the objectives and Open Questions with the product owner and confirm per-theme
  priority and reviewers.
- Hand off to the PRD builder for the technical design of the simulator registry/contract, the
  launch menu and control-service launch protocol (per-simulator containers, concurrency, and
  server-side lifecycle/reconnect), the `ros_gz` bridge configuration, and the `gzweb`
  web-visualization serving behind the proxy.
- Sequence recommendation: Theme A (framework/registry) → Theme B (launch menu) → Theme C
  (Turtlesim, proves the second transport) → Theme D (build-time selection) → Theme E (ROS 2
  integration for Gazebo) → Theme F (Gazebo web visualization).
