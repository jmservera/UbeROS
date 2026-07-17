# UberOS — Project Brief

> A browser-accessible ROS development and simulation environment on Docker Compose.

**Status:** Initial Brief  
**Date:** 2026-07-17T09:22:05.804+02:00  
**Owner:** jmservera

---

## 1. Vision

Provide a complete, containerized ROS robotics workspace — including physics simulators, code editors, and debugging tools — accessible entirely from a standard web browser with no local install beyond Docker.

## 2. Problem Statement

Setting up a ROS development environment requires installing a specific Linux distribution, managing complex dependency chains, configuring GPU passthrough, and running multiple GUI applications. This friction slows onboarding, limits collaboration, and ties developers to a specific workstation. A browser-delivered, container-orchestrated environment eliminates these barriers.

## 3. Goals

| # | Goal |
|---|------|
| G1 | Run a full ROS stack (nodes, topics, services, parameters) inside Docker Compose. |
| G2 | Run physics simulators (e.g., Gazebo) and stream their GUI to the browser via noVNC or equivalent. |
| G3 | Provide a self-hostable browser editing experience for code authoring with access to the ROS workspace; product and remote-access mode are research decisions. |
| G4 | Offer multiple terminal sessions connected to the primary ROS container. |
| G5 | Present a canvas-style window manager in the browser to arrange and resize embedded panels. |
| G6 | Allow any running session or panel to open in a separate browser window for multi-screen use without terminating the underlying workload. How a pop-out behaves when closed (e.g., reattach to canvas or remain detached) is an open research decision. |
| G7 | Expose all services behind a single reverse proxy with path/hostname routing. |

## 4. Primary User Journeys

### J1 — First Launch
User runs `docker compose up`, opens a URL, and sees the window manager canvas with default panels (ROS status, simulator view, code editor, terminal).

### J2 — Code-Build-Test Cycle
User writes a ROS node in the browser code editor, opens a terminal panel, builds with `colcon`, and observes the effect in the simulator panel — all within the same browser tab.

### J3 — Multi-Screen Layout
User opens the simulator panel in a separate browser window on a secondary monitor, continues coding on the primary. The underlying workload continues running uninterrupted. Whether closing the pop-out window reattaches the panel to the canvas is an open research decision.

### J4 — Session Lifecycle
User stops Docker Compose; workload containers shut down. On next `docker compose up`, workspace files, ROS workspace, and configuration persist via volumes. Terminal session continuity (e.g., shell history, live process state) is a separate research decision.

## 5. Required Capabilities

| Capability | Description |
|------------|-------------|
| ROS runtime | Official ROS image providing core middleware and CLI tools. |
| Physics simulation | Gazebo (or equivalent) running headlessly with GUI streamed. |
| GUI streaming | noVNC (or equivalent) providing the browser-side WebSocket/VNC bridge; requires upstream display server and VNC server components whose selection is open. |
| Code editor | Self-hostable browser editing experience with access to the ROS workspace; product selection and remote-access mode are research decisions. |
| Terminal multiplexing | Multiple independent shell sessions to the ROS container. |
| Window manager | Client-side canvas arranging embedded iframes/panels with drag, resize, minimize. |
| Pop-out / reattach | Open a running session panel in a standalone browser window for multi-screen use; reattach-on-close behaviour is a research decision. |
| Reverse proxy | Single ingress routing to backend services; TLS termination point. |
| Orchestration | Docker Compose defining all service images, networks, volumes. |

## 6. Conceptual Component Landscape

```
┌─────────────────────────────────────────────────────┐
│  Browser                                            │
│  ┌───────────────────────────────────────────────┐  │
│  │  Window Manager (frontend app)                │  │
│  │  ┌──────┐  ┌──────────┐  ┌──────┐  ┌─────┐    │  │
│  │  │noVNC │  │ Editor   │  │Term 1│  │Term2│    │  │
│  │  │panel │  │  panel   │  │      │  │     │    │  │
│  │  └──────┘  └──────────┘  └──────┘  └─────┘    │  │
│  └───────────────────────────────────────────────┘  │
│         ▲              ▲            ▲               │
└─────────┼──────────────┼────────────┼───────────────┘
          │ WebSocket    │ HTTP/WS    │ WebSocket
┌─────────┼──────────────┼────────────┼───────────────┐
│  Reverse Proxy (single entrypoint)                  │
└─────────┼──────────────┼────────────┼───────────────┘
          │              │            │
  ┌───────▼───┐   ┌──────▼────┐  ┌────▼────────┐
  │ noVNC +   │   │ Editor    │  │ Terminal    │
  │ VNC server│   │ service   │  │ service     │
  └─────┬─────┘   └─────┬─────┘  └──┬──────────┘
        │               │           │
  ┌─────▼───────────────▼───────────▼────────────┐
  │  ROS Container (core + workspace volumes)    │
  └────────────────────┬─────────────────────────┘
                       │
  ┌────────────────────▼──────────────────────────┐
  │  Simulator Container (Gazebo / headless X11)  │
  └───────────────────────────────────────────────┘
```

> This diagram is illustrative. Actual service boundaries, sidecar placement, and network topology are open research items.

## 7. Non-Functional Requirements

| Category | Requirement |
|----------|-------------|
| Portability | Host platform support (Linux native, Docker Desktop/macOS, WSL2) to be established through a research and validation matrix; platform differences in GPU passthrough, device access, display handling, and filesystem behaviour require explicit per-platform validation. |
| Performance | The research phase must establish measurable interactive streaming targets and validation conditions; no specific frame-rate threshold is committed to at brief stage. |
| Persistence | Code, ROS workspace, and configuration survive container restarts via volumes. |
| Isolation | Compose service boundaries are defined based on lifecycle, security, and resource needs; no host-level installs required. |
| Extensibility | Adding a new ROS package or simulator should require only Dockerfile/compose changes. |
| Security | Authentication and access control mechanism required before any public exposure. |
| Observability | Container logs aggregated; health checks on all services. |

## 8. Open Research Questions

These are **not** decisions. Each must be resolved through evidence-gathering before implementation.

| # | Question | Impact |
|---|----------|--------|
| R1 | **Reverse proxy:** Nginx vs. Traefik — routing ergonomics, WebSocket support, auto-discovery? | Compose config complexity, dev UX. |
| R2 | **ROS distribution:** Which currently supported or LTS release to target? The official ROS release schedule must be checked at research time for current supported distributions; EOL date, image size, and available Docker image variants are key selection criteria. | Base image selection. |
| R3 | **Gazebo generation:** Gazebo Classic (11) vs. Gazebo Sim (Harmonic/Ionic)? The `hub.docker.com/_/gazebo` listing is deprecated with no supported tags; current image registry and tag strategy for both variants must be identified and verified during research. | Simulator container build. |
| R4 | **GUI streaming topology:** Single VNC server per GUI app, or shared X server + single VNC? Latency trade-offs? | Architecture of noVNC layer. |
| R5 | **Security & authentication:** How to gate browser access? OAuth proxy, basic auth, or token-based? | Proxy config, user model. |
| R6 | **GPU acceleration:** Host GPU passthrough (NVIDIA Container Toolkit) vs. software rendering? Cross-platform? | Simulator performance, portability. |
| R7 | **Terminal transport:** WebSocket-based (xterm.js + attach) vs. SSH-in-browser vs. ttyd? | Terminal service choice. |
| R8 | **Frontend framework:** React, Svelte, vanilla JS, or existing window-manager library? | Frontend build tooling, bundle size. |
| R9 | **Pop-out / reattach protocol:** How does a detached window communicate state back to the canvas? SharedWorker, BroadcastChannel, postMessage? | Multi-window synchronization. |
| R10 | **Workload lifecycle vs. view lifecycle:** Should closing a browser tab stop containers? Should a panel reconnect to a still-running session? | Session persistence model. |

## 9. Lifecycle Model

Two independent lifecycles must be explicitly managed:

| Lifecycle | Scope | Start | Stop | Persistence |
|-----------|-------|-------|------|-------------|
| **Workload/session** | Docker Compose services (ROS, Gazebo, terminals) | `docker compose up` | `docker compose down` | Volumes retain workspace files and configuration; terminal session continuity is a research decision. |
| **Browser view** | Window manager canvas, panels, pop-outs | User opens URL | User closes tab/window | Layout state stored client-side; reconnects to running workload on reopen. |

Opening a panel in a pop-out window must not disrupt or terminate the underlying workload session. Whether closing a pop-out reattaches it to the canvas is an open research decision. Refreshing the browser should reconnect to existing streams.

## 10. Initial Success Criteria

| # | Criterion | Verified by |
|---|-----------|-------------|
| S1 | `docker compose up` starts all services without error. | CI or manual run. |
| S2 | Browser at `http://localhost:<port>` shows the window manager with ≥ 1 embedded panel. | Manual verification. |
| S3 | User can type a ROS command in a terminal panel and see output. | Manual verification. |
| S4 | Simulator GUI is visible in a noVNC panel inside the canvas. | Manual verification. |
| S5 | A panel can be opened in a separate browser window without terminating the underlying session. | Manual verification. |
| S6 | Code editor panel can open, edit, and save a file in the ROS workspace. | Manual verification. |

## 11. Delivery Approach

1. **Research phase** — Use [Microsoft HVE Core](https://github.com/microsoft/hve-core) to investigate open questions (§8) and produce evidence-backed recommendations.
2. **Planning phase** — Apply HVE Core's RPI methodology to turn research findings into scoped implementation plans. The documented workflow and terminology of the HVE Core RPI process will be consulted before use; no assumptions about its internal behaviour are made here.
3. **Implementation phase** — Build incrementally, validating each component against success criteria (§10).

> HVE Core and RPI govern the next stages. Their exact process and tooling will be defined by consulting the HVE Core repository — no assumptions about their internal behavior are made here.

## 12. Team Ownership

The authoritative team roster is [`.squad/team.md`](../../.squad/team.md). Summary:

| Member | Role | Responsibility in this project |
|--------|------|-------------------------------|
| **Morpheus** | Technical Lead | Architecture, research coordination, decisions, specs. |
| **Neo** | ROS & Simulation Engineer | ROS images, Gazebo integration, headless rendering, ROS networking. |
| **Trinity** | Platform Engineer | Docker Compose, reverse proxy, networking, volumes, CI. |
| **Switch** | Frontend Engineer | Window manager, pop-out/reattach, noVNC embedding, terminal UI. |
| **Tank** | Integration & Test Engineer | End-to-end tests, health checks, CI pipeline, performance validation. |
| **Scribe** | Session Logger | Meeting notes, decision log maintenance. |
| **Ralph** | Work Monitor | Progress tracking, blocked-item escalation. |
| **Rai** | RAI Reviewer | Responsible AI review of generated content and decisions. |
| **Fact Checker** | Fact Checker | Validates claims, image compatibility, version data before decisions. |

## 13. Source Links

| Resource | URL |
|----------|-----|
| ROS (Robot Operating System) | <https://www.ros.org/> |
| ROS Docker images | <https://hub.docker.com/_/ros/> |
| Gazebo Docker images *(deprecated — no supported tags; current sources require research-phase verification, see R3)* | <https://hub.docker.com/_/gazebo> |
| noVNC | <https://github.com/novnc/noVNC> |
| Microsoft HVE Core | <https://github.com/microsoft/hve-core> |

---

## Appendix A — Original Prompt

<details>
<summary>Verbatim user input that initiated this project</summary>

```
This project ultimate objective is to have a full ROS (https://www.ros.org/) environment, including simulators, running on Docker Compose and available from a web browser. This means that we will need to add some parts as dockerimages: the ros platform core (there are plenty of images here https://hub.docker.com/_/ros/), some simulators like gazebo (https://hub.docker.com/_/gazebo) and we will need to build a website that allows us to stream via noVNC the different GUIs, include a vscode via web for writing code, with the capability to open several consoles to the ROS main container, and to manage the windows inside a canvas, but with the possibility to open the noVNC sessions on separate browser windows to allow using the solution on multiple screens, so we will need to add a proxy (Nginx or Traefic) to manage all this, and a main website to serve as the multiple windows manager. Write this into a docs folder and hire a team with the ability to do all this. Once done, we will use hve-core (https://github.com/microsoft/hve-core) to do some research and also use the RPI methodology to build the project.
```

</details>
