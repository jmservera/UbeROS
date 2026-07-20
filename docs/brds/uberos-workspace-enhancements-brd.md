---
title: UbeROS Workspace Enhancements BRD
description: Business requirements for native pop-out and dock-back, terminal docking affinity, a persistent system configuration dialog, code-server/Copilot credential persistence, and a Gazebo-on-WSL2 GPU research spike.
author: jmservera
ms.date: 07/19/2026
ms.topic: concept
---

# UbeROS Workspace Enhancements BRD

Version 0.3.0 | Status Draft | Owner jmservera | Related [Workspace Management BRD](./uberos-workspace-management-brd.md) · [uberos-init PRD](../prds/uberos-init.md) · [Workspace Enhancements PRD](../prds/uberos-workspace-enhancements.md)

## Progress Tracker

| Phase | Done | Gaps | Updated |
|-------|------|------|---------|
| Context | 100% | Follow-on to Workspace Management BRD, bugs-from-use framing | 2026-07-19 |
| Problem & Drivers | 100% | Five themes confirmed from hands-on use | 2026-07-19 |
| Objectives & Metrics | 80% | Targets drafted; pop-out and GPU remain partly qualitative | 2026-07-19 |
| Stakeholders | 90% | Owner jmservera, delivery Squad; per-requirement reviewers TODO | 2026-07-19 |
| Scope | 100% | Reuse-vs-reinvent decided for pop-out; single-user now confirmed | 2026-07-19 |
| Requirements | 95% | Decisions locked; minimize/collapse + reset added; acceptance criteria ready | 2026-07-19 |

## 1. Business Context and Background

The Workspace Management milestone delivered panel recovery, an operational system menu,
terminal creation, optional authentication, and pop-out. Continued daily use of the Golden
Layout canvas (Simulator/noVNC, Terminal, Code Editor, ROS Status) behind the single Nginx
proxy has surfaced a new batch of defects and capability gaps that this BRD captures.

Two facts from the current codebase shape these requirements:

- Pop-out was reworked into a custom "open in new window" button (`window.open` of the panel
  service URL) after Golden Layout's native pop-out rendered a blank window. That custom
  button works but is a partial reimplementation: it clones instead of moves, has no
  dock-back control, and is not offered on every panel.
- Terminals were made persistent server-side: each terminal now runs inside a named `tmux`
  session (`ttyd --url-arg … tmux new -A -s uberos-<id>`), and the panel carries a stable
  session id in its iframe URL (`/terminal/?arg=<id>`). Any reconnect for the same id
  reattaches the same shell with full scrollback.

Those two facts combine into an important finding (see §7.1): Golden Layout's **native**
pop-out is the right mechanism, and with `tmux` persistence it now preserves terminal history
across a pop-out. This BRD therefore favors reusing the library over extending the custom
button.

## 2. Problem Statement and Business Drivers

### Problem Statement

Operators cannot move a panel into its own OS window and dock it back the way the window
manager is designed to; terminals contaminate unrelated panel groups when docked; there is no
in-app place to change system-wide settings, and no setting survives a reload; the code editor
loses its GitHub Copilot login and configuration between sessions; and the simulator falls back
to software rendering on WSL2 Intel GPUs, making Gazebo slow.

### Business Drivers

| Driver | Description |
|--------|-------------|
| Faithful window management | Multi-monitor users expect true detach/redock, not a synced clone. |
| Reuse over reinvention | Prefer library-native behavior to reduce custom UI surface and maintenance. |
| Predictable layouts | Terminals should group only with terminals so docking stays sensible. |
| Persistent developer context | Editor login/config and system settings must survive restarts. |
| Performance on target hardware | Gazebo should use the Intel Iris Xe GPU on WSL2, not software rendering. |
| Observability and recoverability | The UI must load early, show service health, and let users recover a failing service without reading compose logs. |
| Multi-user readiness | Persistence choices must not preclude per-user isolation later. |

## 3. Business Objectives and Success Metrics

| Objective ID | Objective | KPI / Success Metric | Baseline | Target | Priority |
|--------------|-----------|----------------------|----------|--------|----------|
| BO-1 | True detach and redock via the library | Pop-out moves the panel (original closes) and a dock-back control returns it to the canvas | Custom button clones, no dock-back | Native pop-out + pop-in on every panel | Must |
| BO-2 | Pop-out preserves live state | A popped-out terminal keeps full scrollback and running processes | History lost on clone | History preserved (via tmux id) | Must |
| BO-3 | Terminal docking affinity | Terminals dock only with terminals or stand alone; other panels never gain a terminal-only control | `+` leaks onto non-terminal stacks | Enforced affinity, configurable | Must |
| BO-4 | In-app system configuration | A menu-opened dialog edits system settings that persist across reloads | No settings UI, nothing persists | Config dialog with durable storage | Must |
| BO-5 | Persistent editor identity | code-server keeps settings, extensions, and the Copilot login between sessions | Lost every restart | Persisted, scoped to the user | Must |
| BO-6 | GPU-accelerated simulation on WSL2 | Gazebo renders on the Intel Iris Xe GPU under `compose.override.wsl.yaml` | Software (llvmpipe) fallback | GPU renderer confirmed, or documented blocker | Should |
| BO-7 | Collapsible panels | Every panel can be minimized/collapsed and easily restored | No collapse control | Collapse/expand on every panel | Must |
| BO-8 | Resilient ingress and visible health | The UI and control plane load without waiting for heavy services; per-service health is visible and a failing service is recoverable from the UI | Proxy waits for all services; no health view; stuck service leaves a blank UI | Ingress depends only on control+frontend; health shown; restart from the UI | Must |

## 4. Stakeholders and Roles

| Stakeholder | Role | Interest |
|-------------|------|----------|
| jmservera | Product owner / sponsor | Prioritizes work, accepts deliverables |
| ROS Developer (primary persona) | End user | Multi-monitor workflow, editor identity, sim performance |
| Platform Maintainer | Operator | Configuration, persistence volumes, GPU overlays |
| Squad | Delivery team | Design and implementation |

> TODO: Confirm the reviewer/owner for each requirement theme.

## 5. Scope

### In Scope

- Replace the custom pop-out button with Golden Layout's native pop-out and dock-back, on every
  pop-out-capable panel, preserving live content (including terminal history).
- Terminal docking affinity: terminals may share a stack only with other terminals or stand
  alone; make the policy configurable.
- A system configuration dialog launched from the menu, with durable persistence.
- Persistence of code-server user data, extensions, and the GitHub Copilot login, structured so
  a future multi-user model can isolate per user.
- Research spike: Gazebo GPU acceleration on WSL2 with the Intel Iris Xe, plus implementation if
  a working path is found.
- Panel minimize/collapse: every panel can be collapsed and easily restored.
- Resilient ingress and health visibility: the single proxy comes up on the control plane and SPA
  alone, resolves the remaining backends lazily, and the GUI shows per-service health with a
  restart affordance.

### Out of Scope

- Building the full multi-user identity system in this iteration (persistence must not preclude
  it; see Open Questions).
- Replacing Golden Layout or the single-reverse-proxy topology.
- Changing the terminal transport away from ttyd/tmux.

### Assumptions

- Golden Layout v2 remains the window manager (ADR-004); native pop-out uses the same app origin
  and bundle in the child window.
- Terminal `tmux` session persistence (already implemented) stays in place and is the mechanism
  that makes pop-out non-destructive for terminals.
- Init constraints hold: single ingress, backend ports internal, single-user now with multi-user
  not precluded.

## 6. Current and Future Business Processes

### Current State

- Pop-out uses a custom `⇗` button that opens the panel's service URL in a new browser window;
  the original panel stays in the canvas (a synced clone), there is no dock-back control, and the
  ROS Status panel has no pop-out button.
- Golden Layout's native pop-out icon is hidden because it previously produced a blank
  `?gl-window=` window.
- The `+` (new terminal) control appears on any stack that contains a terminal, so docking a
  terminal into the editor or simulator stack makes `+` appear there too.
- There is no configuration dialog; only the window layout persists (localStorage key
  `uberos.layout.v1`).
- code-server starts fresh each run: settings, installed extensions, and the Copilot login are
  lost on restart.
- On WSL2 with the Intel Iris Xe, Gazebo renders with llvmpipe (software) despite the
  `/dev/dxg` + `/usr/lib/wsl` Mesa D3D12 overlay.

### Future State

- Native pop-out moves a panel into its own window and dock-back is manual — via the window's
  native pop-in control or reopening the panel from the menu; terminals keep their shell and
  scrollback because the reconnect reattaches the same tmux session.
- Terminals only ever share a stack with other terminals; the grouping policy is configurable.
- A configuration dialog edits system settings that persist across reloads and restarts.
- Any panel can be collapsed and easily restored.
- code-server keeps its user data, extensions, and Copilot login across sessions, stored so it
  can later be isolated per user.
- Gazebo uses the Intel GPU on WSL2, or the blocker is documented with a recommended path.
- The single ingress and the operational control plane come up promptly even while heavy services
  are still starting; the canvas shows each service's health and lets the user restart a failing
  one, instead of a blank page that forces reading `docker compose logs`.

## 7. Business Requirements

Requirement IDs use a theme prefix. Priority uses MoSCoW.

### 7.1 Theme A — Native pop-out and dock-back (items 1a, 1b, 1c)

Technical finding (answers "why not reuse the library?"): Golden Layout's native pop-out already
provides exactly the requested behavior. `BrowserPopout` serializes the popped item's config to
`localStorage` under a `gl-window-config-<id>` key and opens `location.href?gl-window=<key>` in a
new window; the child window's Golden Layout detects the `gl-window` parameter and renders only
the popped component, exposing a **pop-in** control and `settings.popInOnClose` to dock back to
the original parent (tracked via `parentId`). The earlier blank window was self-inflicted: in the
child window our `onMount` always called `loadLayout(default/saved)`, overwriting the sub-window
config Golden Layout was about to load (and re-showing the full menu on refresh). The fix is to
detect sub-window mode (`layout.isSubWindow`) and skip our `loadLayout`, keep iframe `src`
absolute (already done), and re-enable the native pop-out icon. Because terminals now reconnect to
a persistent tmux session by id, native pop-out no longer loses terminal history. Reference:
[golden-layout](https://github.com/golden-layout/golden-layout) (`src/ts/controls/browser-popout.ts`;
Popouts documentation).

| ID | Requirement | Priority |
|----|-------------|----------|
| BR-PO-1 | Use Golden Layout's native pop-out so popping a panel moves it out of the canvas (the original is removed, not cloned). | Must |
| BR-PO-2 | Provide a dock-back control so a popped-out panel returns to its original position (or a sensible fallback) in the main canvas. | Must |
| BR-PO-3 | Offer pop-out on every pop-out-capable panel, including ROS Status. | Must |
| BR-PO-4 | Preserve live content on pop-out and dock-back: a terminal keeps its shell, scrollback, and running processes. | Must |
| BR-PO-5 | Remove the custom "open in new window" button and its bespoke window logic once native pop-out is in place, unless a validated gap remains. | Should |
| BR-PO-6 | Retire the earlier blank-window failure: the child window must render the popped panel on first open and on refresh, without showing the full app chrome. | Must |

Acceptance criteria:

- Popping out a Terminal removes it from the canvas, opens it in a separate OS window, and the
  shell still shows prior output and any running process; docking back returns the same live
  terminal to the canvas.
- The ROS Status panel shows a pop-out control and pops out to a working window.
- Refreshing a popped-out window keeps showing only that panel (no full menu/canvas).
- No synced-clone remains after a pop-out.

### 7.2 Theme B — Terminal docking affinity (item 3)

| ID | Requirement | Priority |
|----|-------------|----------|
| BR-TD-1 | A terminal may share a stack only with other terminals, or stand alone in its own stack. | Must |
| BR-TD-2 | Terminals must not dock into stacks that hold non-terminal panels (Editor, Simulator, ROS Status), and vice versa. | Must |
| BR-TD-3 | The terminal-only `+` (new terminal) control appears only on stacks that are terminal-only. | Must |
| BR-TD-4 | Existing drag/move/resize/undock behavior for all panels remains fully functional. | Must |
| BR-TD-5 | Docking uses a configurable per-type grouping policy. Only terminals are grouped by default; all other panels remain ungrouped. | Should |

Acceptance criteria:

- Dragging a terminal over the Editor or Simulator stack does not allow a drop that mixes types;
  dragging it over another terminal stack or empty space does.
- After any docking operation, `+` is present only on terminal-only stacks.
- General panel rearrangement (non-terminal) is unchanged.
- A configuration flag can relax or tighten the affinity (ties to Theme C).

> Note: Golden Layout v2 has no built-in per-type drop constraint, so this needs custom
> drag/drop handling. The design should be captured in the follow-on PRD.

### 7.3 Theme C — System configuration dialog with persistence (item 4)

| ID | Requirement | Priority |
|----|-------------|----------|
| BR-CFG-1 | Add a menu entry that opens a configuration dialog for system-wide settings. | Must |
| BR-CFG-2 | Settings persist across reloads and container restarts. | Must |
| BR-CFG-3 | The dialog groups settings logically and validates input before saving. | Should |
| BR-CFG-4 | Persistence is structured so settings can later be scoped per user without a redesign. | Should |
| BR-CFG-5 | At least one real setting is wired end to end at launch (candidate: the Theme B terminal-affinity toggle). | Must |
| BR-CFG-6 | The dialog exposes an initial settings set — default layout, simulator GPU adapter, theme, auth-mode display, terminal-affinity/grouping toggle — and a reset-to-defaults control. | Should |

Acceptance criteria:

- Opening the menu shows a Configuration entry; it opens a dialog and closing it saves.
- A changed setting survives a browser reload and a `docker compose restart`.
- The affinity toggle set in the dialog changes terminal docking behavior.

> Storage decision (resolved): settings persist **server-side** through the control service into a
> persisted file/volume (single-user now; the schema reserves a user key for future per-user
> scoping). Per-browser-only preferences may still use localStorage like `uberos.layout.v1`.

### 7.6 Theme F — Panel minimize/collapse

| ID | Requirement | Priority |
|----|-------------|----------|
| BR-MIN-1 | Every panel can be collapsed to its header/tab bar (minimized) and easily restored to its previous size. | Must |

Acceptance criteria:

- A control collapses any panel to just its header/tab bar and restores it to its previous size.
- Collapsing a panel does not stop its workload or lose its content.

> Note: Golden Layout v2 has no native minimize, so this needs a custom collapse control. The
> design is captured in the follow-on PRD (FR-F1).

### 7.4 Theme D — code-server and Copilot credential persistence (item 5)

| ID | Requirement | Priority |
|----|-------------|----------|
| BR-CS-1 | Persist code-server user data, settings, and installed extensions across restarts via a durable volume. | Must |
| BR-CS-2 | Persist the GitHub Copilot login so the editor stays authenticated across sessions. | Must |
| BR-CS-3 | Structure persistence per user so a future multi-user/multitenant model isolates each user's data and tokens. | Should |
| BR-CS-4 | Handle stored credentials per the repo's secret-handling rules (never committed; protected at rest). | Must |

Acceptance criteria:

- After a restart, code-server keeps its settings and extensions and does not require a new
  Copilot login.
- The persisted data lives on a named volume/path that a per-user layout can extend.
- No token is written to a committed file.

> Design notes for the PRD: code-server keeps user state under `~/.local/share/code-server`
> (User data, `Machine`, secrets) and `~/.config/code-server`; extensions under the user-data
> extensions dir. Mounting those paths to a named volume persists login/config. Copilot stores
> its session in the editor's secret storage inside that data dir, so persisting the volume keeps
> the login. For multi-user, parameterize the data dir per user (for example
> `/data/users/<uid>/code-server`) and run isolated editor instances or per-user `--user-data-dir`.
> Include a spike on token-at-rest protection.

### 7.5 Theme E — Gazebo GPU acceleration on WSL2 Intel (item 2) — research spike

| ID | Requirement | Priority |
|----|-------------|----------|
| BR-GPU-1 | Determine why Gazebo falls back to software (llvmpipe) on WSL2 with the Intel Iris Xe despite the `/dev/dxg` + `/usr/lib/wsl` Mesa D3D12 overlay, while compute workloads (for example embeddings) work with the same passthrough. | Should |
| BR-GPU-2 | Produce a documented, reproducible path to GPU-accelerated Gazebo rendering on this host, or a documented blocker with the recommended alternative. | Should |
| BR-GPU-3 | If a working path exists, implement it in the WSL overlay without breaking native-Linux/Intel and NVIDIA overlays. | Should |

Acceptance criteria:

- A short write-up records the diagnosis (renderer actually used, driver present, GL/Vulkan level
  reached) and the fix or blocker.
- If solvable, `glxinfo -B` inside the simulator/vnc container reports the Intel adapter (not
  llvmpipe) and Gazebo runs on the GPU under `compose.override.wsl.yaml`.

> Investigation hypotheses for the spike: Gazebo (gz sim) defaults to the **ogre2** render engine,
> which needs OpenGL 3.3+/compute features that the Mesa **d3d12** (dozen) Gallium driver may not
> fully expose on WSL2, whereas compute paths (Level Zero/oneAPI over `/dev/dxg`) do not use the GL
> render path. Things to verify: `d3d12_dri.so` is present in the simulator image; the WSL driver
> libs are actually on the loader path in the container that renders (simulator vs vnc sidecar);
> `glxinfo -B` renderer; trying `--render-engine ogre` (ogre1) or Vulkan; `MESA_GL_VERSION_OVERRIDE`;
> and whether the headless X server the GUI uses reaches the same GPU. Cross-reference
> [docs/specs/03-intel-openvino-research.md](../specs/03-intel-openvino-research.md).

### 7.7 Theme G — Resilient ingress and service health visibility

Technical finding: the reverse proxy currently declares `depends_on` with `condition:
service_healthy` for ros, vnc, editor, frontend, and control, so the single ingress does not start
until every backend is healthy. Because nginx resolves the `upstream` hostnames at config-load
time, a backend that is not yet running would otherwise stop nginx from starting at all, which is
why the hard gate exists. The side effect is a chicken-and-egg failure: the operational control
plane exists to restart unhealthy services (BR-007), but the only way to reach it (the proxy) will
not come up until those services are already healthy, so a stuck service cannot be recovered from
the UI and the user sees nothing but must read `docker compose logs`. The fix is to make the
ingress depend only on the control plane and the SPA, resolve the remaining backends lazily at
request time (`resolver 127.0.0.11` + variable `proxy_pass`), and surface per-service health
(already available from the control `/services` endpoint) in the GUI with a restart affordance.

| ID | Requirement | Priority |
|----|-------------|----------|
| BR-RI-1 | The single ingress must start and serve the SPA and the control plane as soon as the frontend and control services are healthy, without waiting for ros, simulator, vnc, or editor. | Must |
| BR-RI-2 | A backend that is still starting or unhealthy must not prevent the ingress from starting; its route returns a graceful "service starting/unavailable" response instead. | Must |
| BR-RI-3 | The GUI must show each managed service's health, refreshed as services come up. | Must |
| BR-RI-4 | From the health view, a user can restart an unhealthy service and recover its panel without a full-stack restart. | Should |

Acceptance criteria:

- With ros/simulator/vnc/editor still starting, the canvas loads and the health view shows their
  status; the SPA and control plane are reachable throughout.
- Forcing a backend to stay down still boots the proxy; that panel shows a clear message and the
  service can be restarted from the health view, after which the panel recovers.
- The SPA and control routes remain reachable regardless of any single backend's state.

> Note: nginx variable `proxy_pass` changes URI/path handling, so each proxied route
> (`/control/`, `/editor/`, `/ros`, `/novnc`, `/terminal`) needs its rewrite semantics preserved
> and tested. The SPA and control routes stay statically resolved (hard dependencies). Design is
> captured in the follow-on PRD (Theme G, FR-G1..FR-G4).

## 8. Dependencies and Constraints

- Golden Layout v2 native pop-out relies on the child window loading the same app bundle at the
  same origin (already true behind the single proxy) and on the app not overwriting the sub-window
  config.
- Terminal history preservation depends on the existing ttyd/tmux session persistence.
- Configuration and code-server persistence must respect the single-ingress, ports-internal
  topology and the secret-handling rules.
- WSL GPU work is host-specific (Windows + WSL2 + Docker Desktop) and must not regress the
  native-Linux or NVIDIA overlays.
- The resilient-ingress change relies on nginx runtime DNS (`resolver 127.0.0.11`) and variable
  `proxy_pass` for the non-critical backends; the SPA and control plane stay statically resolved so
  the shell always loads.

## 9. Open Questions

All resolved 2026-07-19 (see the [Workspace Enhancements PRD](../prds/uberos-workspace-enhancements.md)).

1. Multi-user timing — Resolved: single-user now; the persistence schema reserves a user key so
   per-user isolation can be added later without redesign.
2. Configuration storage — Resolved: server-side via the control service for system settings;
   per-browser-only preferences may stay in localStorage.
3. First configuration settings — Resolved: default layout, simulator GPU adapter, theme,
   auth-mode display, and the terminal-affinity/grouping toggle, plus a reset-to-defaults button.
4. Dock-back behavior — Resolved: auto-dock on window close via `popInOnClose`.
5. Terminal affinity granularity — Resolved: per-type grouping policy; only terminals are grouped
   now, all other panels remain ungrouped.
6. Copilot token at rest — Resolved: rely on volume permissions this iteration and document the
   risk; encrypt tokens at rest before any non-localhost or multi-user exposure (do not
   over-engineer now).

## 10. Handoffs and Next Steps

- Validate the Open Questions with the product owner and confirm per-theme priority.
- Hand off to the PRD builder for the technical design of Themes A–D (native pop-out sub-window
  bootstrap, terminal drop-constraint logic, configuration store and schema, code-server
  persistence layout), and to a research spike for Theme E.
- Sequence recommendation: Theme A (native pop-out + dock-back, highest daily impact and reduces
  custom code) → Theme B (affinity) → Theme C (config, enables the affinity toggle) → Theme D
  (editor persistence) → Theme E (GPU spike).
