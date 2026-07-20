<!-- markdownlint-disable-file -->
<!-- markdown-table-prettify-ignore-start -->
# UbeROS Workspace Enhancements - Product Requirements Document (PRD)
Version 1.2.0 | Status Approved | Owner jmservera | Team Squad | Target Next iteration | Lifecycle Approved

## Progress Tracker
| Phase | Done | Gaps | Updated |
|-------|------|------|---------|
| Context | 90% | Initiative framed from hands-on defects + 5 feature themes | 2026-07-19 |
| Problem & Users | 85% | Personas confirmed; journeys light | 2026-07-19 |
| Scope | 90% | Reuse-vs-reinvent decided for pop-out; multi-user timing open | 2026-07-19 |
| Requirements | 90% | FR/NFR incl. minimize + reset; acceptance criteria ready | 2026-07-19 |
| Metrics & Risks | 80% | Targets drafted; finalized per theme at its design gate (GPU metric spike-dependent) | 2026-07-19 |
| Operationalization | 75% | Volume/config decisions scheduled at Theme C/D design gates | 2026-07-19 |
| Finalization | 100% | Approved 2026-07-19; ready for implementation | 2026-07-19 |
Unresolved Critical Questions: 0 | TBDs: 1

## 1. Executive Summary
### Context
UbeROS is a browser-based ROS development environment: a Golden Layout v2 canvas of dockable
panels (Simulator/noVNC, Terminal, Code Editor, ROS Status) served behind a single Nginx reverse
proxy, launched with `docker compose up`. The Workspace Management milestone shipped panel
recovery, a system menu, terminal creation, optional auth, and pop-out. Continued daily use has
surfaced five improvement themes, captured in the [Workspace Enhancements BRD](../brds/uberos-workspace-enhancements-brd.md).
### Core Opportunity
Reuse Golden Layout's native window management (detach/redock) instead of the current custom
pop-out button, and make the workspace stateful where it matters — terminal history, editor
identity, and system settings — while unlocking GPU-accelerated simulation on WSL2. Together these
turn UbeROS from "works until you rearrange or restart it" into a dependable daily driver.
### Goals
| Goal ID | Statement | Type | Baseline | Target | Timeframe | Priority |
|---------|-----------|------|----------|--------|-----------|----------|
| G-001 | Replace custom pop-out with Golden Layout native detach + dock-back on every panel | Capability | Custom clone button, no dock-back | Native pop-out/pop-in on all panels | This iteration | Must |
| G-002 | Pop-out and re-dock preserve live panel state | Reliability | Terminal history lost on clone | History/process preserved | This iteration | Must |
| G-003 | Terminals dock only with terminals or standalone, configurable | Usability | `+` leaks onto mixed stacks | Enforced, toggleable affinity | This iteration | Must |
| G-004 | System configuration dialog with durable persistence | Capability | No settings UI; nothing persists | Config dialog persists across restart | This iteration | Must |
| G-005 | code-server keeps settings, extensions, and Copilot login across sessions | Reliability | Lost every restart | Persisted, per-user-ready | This iteration | Must |
| G-006 | Gazebo uses the Intel Iris Xe GPU on WSL2 (or documented blocker) | Performance | Software (llvmpipe) fallback | GPU renderer confirmed or blocker documented | This iteration | Should |
| G-007 | Panels can be minimized/collapsed and easily restored | Usability | No collapse control | Collapse/expand on every panel | This iteration | Must |
| G-008 | Ingress comes up early with visible service health and guided recovery | Reliability | Proxy waits for all services healthy; no in-GUI health view | Proxy depends only on control+frontend; per-service health shown; restart from the UI | This iteration | Must |
### Objectives (Optional)
| Objective | Key Result | Priority | Owner |
|-----------|------------|----------|-------|
| Reduce custom UI surface | Custom pop-out button/logic removed once native works | Must | Squad |
| Make workspace stateful | Terminal, editor, and settings survive restart | Must | Squad |

## 2. Problem Definition
### Current Situation
Pop-out uses a custom `⇗` button that opens the panel's service URL in a new browser window; the
original panel stays behind as a synced clone, there is no dock-back control, and ROS Status has no
pop-out. Golden Layout's native pop-out icon is hidden because it previously rendered a blank
`?gl-window=` window. The `+` new-terminal control appears on any stack containing a terminal, so
docking a terminal into the editor/simulator stack leaks it there. No configuration dialog exists
and only the window layout persists. code-server starts fresh each run, losing settings, extensions,
and the Copilot login. On WSL2 with the Intel Iris Xe, Gazebo renders with llvmpipe (software).
### Problem Statement
Operators cannot detach/redock panels the way the window manager is designed to, terminals
contaminate unrelated groups, no system setting or editor identity survives a reload, and the
simulator does not use the GPU on the primary WSL2 host.
### Root Causes
* The custom pop-out re-opens a service URL (a new client), so it clones instead of moving and cannot dock back; native pop-out was abandoned after a self-inflicted blank window (the app called `loadLayout` in the sub-window, clobbering Golden Layout's `?gl-window=` config).
* The `+` control keys off "stack contains a terminal" rather than a terminal-only affinity rule; Golden Layout has no native per-type drop constraint.
* No persistence layer exists for settings; code-server's user-data directory is not mounted to a durable volume.
* Gazebo's default ogre2 render engine may not be fully served by the Mesa d3d12 (dozen) Gallium driver on WSL2.
### Impact of Inaction
Multi-monitor workflows stay clumsy, rearranging the canvas breaks terminals, developers re-login
and reconfigure the editor every session, and simulation stays slow on the target hardware — all
eroding trust in the environment.

## 3. Users & Personas
| Persona | Goals | Pain Points | Impact |
|---------|-------|------------|--------|
| ROS Developer (primary) | Detach panels across monitors; keep terminal, editor, and Copilot state; smooth sim | Clones not moves; lost history/login; slow Gazebo | Daily productivity |
| Platform Maintainer | Configure the system; manage persistence and GPU overlays | No settings UI; no durable volumes | Operability |
| Future Tenant Admin (later) | Isolate per-user data and tokens | Persistence not yet user-scoped | Multi-tenant readiness |
### Journeys (Optional)
Detach a terminal onto a second monitor, keep working, dock it back with history intact; open the
menu to change a system setting that sticks; restart the stack and find the editor still logged in.

## 4. Scope
### In Scope
* Native Golden Layout pop-out + dock-back on every pop-out-capable panel, preserving live content (terminal history via the existing tmux session id).
* Terminal docking affinity (terminals with terminals or standalone), made configurable.
* A menu-launched system configuration dialog with durable persistence.
* code-server persistence of user data, extensions, and the Copilot login, structured for future per-user isolation.
* Research spike (and implementation if feasible) for Gazebo GPU acceleration on WSL2 Intel.
### Out of Scope (justify if empty)
* Full multi-user identity/self-service management this iteration (persistence must not preclude it).
* Replacing Golden Layout, the single-proxy topology, or the ttyd/tmux terminal transport.
### Assumptions
* Golden Layout v2 native pop-out loads the same app bundle at the same origin in the child window (true behind the single proxy) and works once the app stops calling `loadLayout` in sub-window mode.
* The already-implemented ttyd/tmux session persistence remains the mechanism that makes pop-out non-destructive for terminals.
* Init constraints hold: single ingress, backend ports internal, single-user now with multi-user not precluded.
### Decisions (resolved 2026-07-19)
* Configuration is persisted **server-side** through the control service (to a file on a mounted volume), not in the browser. Per-browser-only preferences may still use localStorage, but system settings are server-side.
* The system ships **single-user** this iteration; the persistence schema reserves a user key so per-user isolation can be added later without redesign.
* Dock-back uses Golden Layout `popInOnClose`: **closing a popped-out window auto-docks** the panel back to its origin.
  * **Superseded 2026-07-20:** revised to `popInOnClose: false` with **manual pop-in** — Golden Layout's native pop-in button (`.lm_popin`, added via `layout.checkAddDefaultPopinButton()`) in the popped-out window, or reopening the panel from the Panels menu. Auto-dock-on-close was dropped because it behaved erratically on passive panels (Simulator, ROS Status): Chrome does not reliably fire the popout window's `beforeunload` for windows that never received a user gesture. Closing the popped-out window via the OS button now simply leaves the panel closed (reopen from the Panels menu).
### Constraints
* Single reverse proxy; backend ports never host-published.
* Secret-handling rules: tokens never committed; protected at rest.
* WSL GPU work must not regress native-Linux/Intel or NVIDIA overlays.

## 5. Product Overview
### Value Proposition
A browser ROS workspace that behaves like a real window manager and remembers your context —
panels detach and redock with live state, terminals stay coherent, settings and editor identity
persist, and simulation uses the GPU.
### Differentiators (Optional)
* Library-native window management instead of a bespoke clone button.
* Server-side terminal persistence (tmux) so detaching never loses a shell.
### UX / UI (Conditional)
Pop-out uses Golden Layout's header control; docking back is manual via the popped-out window's
native pop-in control (or reopening the panel from the Panels menu). Every panel has a
collapse-to-header control (the panel shrinks to its header/tab
bar; click to restore to its previous size). A Configuration
menu entry opens a modal dialog whose initial settings are: default layout, simulator GPU adapter,
theme, auth-mode display, and the terminal-affinity/grouping toggle, plus a reset-to-defaults
button. UX Status: Draft

## 6. Functional Requirements
| FR ID | Title | Description | Goals | Personas | Priority | Acceptance | Notes |
|-------|-------|------------|-------|----------|----------|-----------|-------|
| FR-A1 | Native pop-out (move) | Popping a panel uses Golden Layout native pop-out; the original leaves the canvas (no clone). | G-001 | ROS Developer | Must | Pop-out removes the source panel and opens it in a separate window | Re-enable `showPopoutIcon` |
| FR-A2 | Dock-back to canvas | Docking a popped-out panel back to the canvas is manual: via Golden Layout's native pop-in button in the popped-out window, or by reopening the panel from the Panels menu. | G-001 | ROS Developer | Must | Clicking the pop-in control in the popped-out window returns the panel to the canvas | GL `popInOnClose: false` + `checkAddDefaultPopinButton()`; `popInOnClose:true` auto-close-dock was dropped due to erratic behavior on passive panels |
| FR-A3 | Pop-out on all panels | Every pop-out-capable panel, including ROS Status, exposes pop-out. | G-001 | ROS Developer | Must | ROS Status pops out to a working window | |
| FR-A4 | Preserve live content | Pop-out/dock-back keeps a terminal's shell, scrollback, and running processes. | G-002 | ROS Developer | Must | Terminal shows prior output and running process after pop-out and after dock-back | Relies on tmux `?arg=<id>` |
| FR-A5 | Sub-window bootstrap | The child window renders only the popped panel on first open and on refresh (no full chrome). | G-001,G-002 | ROS Developer | Must | Refreshing the popped window keeps showing only that panel | Guard `layout.isSubWindow`; skip `loadLayout` |
| FR-A6 | Retire custom button | Remove the custom "open in new window" button/logic once native works, absent a validated gap. | G-001 | Maintainer | Should | Only native pop-out remains | |
| FR-B1 | Terminal affinity | A terminal may share a stack only with terminals or stand alone. | G-003 | ROS Developer | Must | Dropping a terminal onto a mixed stack is prevented; onto a terminal stack/empty is allowed | GL lacks native per-type constraint |
| FR-B2 | Scoped `+` control | The new-terminal `+` appears only on terminal-only stacks. | G-003 | ROS Developer | Must | After any docking, `+` is only on terminal-only stacks | |
| FR-B3 | Preserve move UX | All existing drag/move/resize/undock behavior remains intact. | G-003 | ROS Developer | Must | Non-terminal rearrangement unchanged | |
| FR-B4 | Configurable grouping | Docking uses a configurable per-type grouping policy; only terminals are grouped by default, other panels remain ungrouped. | G-003,G-004 | Maintainer | Should | A config setting adjusts grouping; non-terminal panels stay ungrouped | Per-type policy; ties to FR-C |
| FR-C1 | Configuration dialog | A menu entry opens a system configuration dialog. | G-004 | Maintainer | Must | Menu shows Configuration; dialog opens and saves | |
| FR-C2 | Durable settings | Settings persist across reloads and container restarts. | G-004 | Maintainer | Must | A changed setting survives reload and `docker compose restart` | Server-side via control service to a persisted file/volume |
| FR-C3 | Validated input | The dialog groups settings and validates before saving. | G-004 | Maintainer | Should | Invalid input is rejected with a message | |
| FR-C4 | User-scopable store | Persistence structure allows later per-user scoping without redesign. | G-004 | Tenant Admin | Should | Store schema reserves a user key; single-user default now | Single-user this iteration |
| FR-C5 | First real setting | At least one setting (terminal-affinity toggle) is wired end to end. | G-003,G-004 | ROS Developer | Must | Toggling in the dialog changes terminal docking | |
| FR-C6 | Reset to defaults | The dialog provides a control that resets all settings to their defaults. | G-004 | Maintainer | Should | Reset restores default values and persists them | |
| FR-D1 | Editor data persistence | Persist code-server user data, settings, and extensions via a durable volume. | G-005 | ROS Developer | Must | After restart, settings and extensions remain | |
| FR-D2 | Copilot login persistence | Persist the GitHub Copilot login across sessions. | G-005 | ROS Developer | Must | After restart, no new Copilot login required | |
| FR-D3 | Per-user structure | Structure persistence so a future multi-user model isolates each user's data/tokens. | G-005 | Tenant Admin | Should | Data path parameterizable per user | |
| FR-D4 | Secret handling | Stored credentials follow secret-handling rules (never committed; protected at rest). | G-005 | Maintainer | Must | No token in a committed file | Volume perms now; document encryption-required-later |
| FR-E1 | GPU diagnosis | Determine why Gazebo falls back to software on WSL2 Intel despite the D3D12 overlay. | G-006 | Maintainer | Should | Write-up records renderer used, driver present, GL/Vulkan level | Spike |
| FR-E2 | GPU path or blocker | Produce a reproducible GPU path, or a documented blocker with an alternative. | G-006 | Maintainer | Should | `glxinfo -B` reports the Intel adapter, or blocker documented | |
| FR-E3 | Overlay implementation | If solvable, implement in the WSL overlay without regressing other overlays. | G-006 | Maintainer | Should | Native-Linux/NVIDIA overlays unaffected | |
| FR-F1 | Panel minimize/collapse | Every panel can be collapsed to just its header/tab bar and restored to its previous size. | G-007 | ROS Developer | Must | A control collapses a panel to its header bar and restores it to its previous size | Collapse-to-header; GL v2 lacks native minimize, custom control |
| FR-G1 | Resilient ingress startup | The proxy serves the SPA and control routes as soon as `frontend` and `control` are healthy, without waiting for `ros`, `simulator`, `vnc`, or `editor`. | G-008 | ROS Developer,Maintainer | Must | With the heavy services still starting, the canvas and health view load and are usable | Proxy hard-depends only on control + frontend |
| FR-G2 | Lazy upstream resolution | Backend routes (rosbridge, noVNC, editor, terminal) resolve their upstream at request time so a not-yet-ready backend returns a graceful page instead of blocking proxy startup. | G-008 | Maintainer | Must | Booting with a backend down still starts the proxy; that route returns a friendly "service starting/unavailable" page, not a hang or a failed proxy | nginx `resolver 127.0.0.11` + variable `proxy_pass`; SPA/control stay static |
| FR-G3 | Service health view | The GUI surfaces each managed service's health (healthy/unhealthy/starting/unknown) from the control `/services` endpoint, refreshed periodically. | G-008 | ROS Developer | Must | A status view shows per-service health that updates as services come up | Reuse existing control `/services` |
| FR-G4 | Guided recovery | From the health view a user can restart an unhealthy service, and a panel whose backend is unavailable shows a clear message with a retry/restart affordance. | G-008 | ROS Developer | Should | Restarting a failed service from the view recovers its panel without a full stack restart | Realizes AE-R1; reuses restart (BR-007) |
### Feature Hierarchy (Optional)
```plain
Workspace Enhancements
├─ A. Native pop-out & dock-back
├─ B. Terminal docking affinity
├─ C. System configuration + persistence
├─ D. code-server / Copilot persistence
├─ E. Gazebo GPU on WSL2 (spike)
├─ F. Panel minimize/collapse
└─ G. Resilient ingress & health visibility
```

## 7. Non-Functional Requirements
| NFR ID | Category | Requirement | Metric/Target | Priority | Validation | Notes |
|--------|----------|------------|--------------|----------|-----------|-------|
| NFR-1 | Reliability | Pop-out/dock-back never loses terminal state | 0 lost sessions across pop-out/dock cycles | Must | Manual + acceptance test | tmux reattach |
| NFR-2 | Maintainability | Prefer library-native behavior over custom UI | Custom pop-out logic removed | Should | Code review | |
| NFR-3 | Security | Tokens/secrets protected at rest, never committed | No secret in git; volume perms set | Must | Review + secret scan | |
| NFR-4 | Compatibility | WSL GPU overlay does not regress other overlays | `docker compose config` valid for base+intel+wsl+nvidia | Must | Compose validation | |
| NFR-5 | Performance | Simulator uses GPU when available on WSL2 | Renderer != llvmpipe (if feasible) | Should | `glxinfo -B` | Spike-dependent |
| NFR-6 | Usability | Docking rules are predictable and discoverable | Affinity enforced with clear affordances | Must | Usability check | |
| NFR-7 | Portability | Persistence survives restart and image rebuild | Data intact after `down`/`up` (named volume) | Must | Restart test | |
| NFR-8 | Reliability | A slow or failed backend never blocks the ingress, SPA, health view, or control plane from loading | Proxy boots with only control+frontend healthy; other routes degrade gracefully | Must | Startup test with a backend forced unhealthy | Removes the chicken-and-egg where the restart UI is unreachable until every service is already healthy |
Categories: Performance, Reliability, Scalability, Security, Privacy, Accessibility, Observability, Maintainability, Localization (if), Compliance (if).

## 8. Data & Analytics (Conditional)
### Inputs
Window layout (localStorage `uberos.layout.v1`); terminal session ids in component state; system
configuration values (server-side via the control service); code-server user-data directory.
### Outputs / Events
Persisted layout, config, and editor data; tmux sessions on the ROS container.
### Instrumentation Plan
| Event | Trigger | Payload | Purpose | Owner |
|-------|---------|--------|---------|-------|
| popout | User pops a panel out | panel type | Verify native pop-out usage | Squad |
| dock-back | User docks a panel back | panel type | Verify pop-in works | Squad |
| config-save | Dialog save | changed keys | Confirm persistence | Squad |
### Metrics & Success Criteria
| Metric | Type | Baseline | Target | Window | Source |
|--------|------|----------|--------|--------|--------|
| Terminal state loss on pop-out | Count | Every time | 0 | Per session | Manual/test |
| Copilot re-logins per restart | Count | 1 | 0 | Per restart | Manual |
| Gazebo renderer | Category | llvmpipe | Intel adapter | Per launch | glxinfo |

## 9. Dependencies
| Dependency | Type | Criticality | Owner | Risk | Mitigation |
|-----------|------|------------|-------|------|-----------|
| Golden Layout v2 native pop-out | Library | High | Squad | Sub-window bootstrap subtlety | Guard `isSubWindow`, absolute iframe URLs |
| ttyd + tmux session persistence | Backend | High | Squad | Session lifecycle edge cases | Named sessions, attach-or-create |
| Control service (config store) | Backend | High | Squad | New endpoint/volume | Reuse existing control plane; persist to mounted file |
| code-server data volume | Infra | High | Squad | Secret at rest | Named volume + perms + secret rules |
| Mesa d3d12 driver on WSL2 | Infra | Medium | Squad | Renderer gaps for ogre2 | Spike; ogre1/Vulkan fallback |
| nginx runtime DNS (`resolver 127.0.0.11`) | Infra | High | Squad | Variable `proxy_pass` alters URI/path handling | Per-route rewrite tests; keep SPA/control statically resolved |

## 10. Risks & Mitigations
| Risk ID | Description | Severity | Likelihood | Mitigation | Owner | Status |
|---------|-------------|---------|-----------|-----------|-------|--------|
| R-1 | Native pop-out child window renders blank again | High | Medium | Guard `isSubWindow`; skip `loadLayout`; keep iframe URLs absolute | Squad | Open |
| R-2 | tmux reattach edge cases (dead session) | Medium | Low | attach-or-create; sanitize id | Squad | Open |
| R-3 | Per-type drop constraint fights GL internals | Medium | Medium | Hook drag/drop events; keep general move UX intact | Squad | Open |
| R-4 | Copilot token persisted insecurely | High | Medium | Volume perms now + documented risk; encrypt before non-localhost/multi-user exposure | Squad | Open |
| R-5 | Gazebo GPU not achievable on WSL2 d3d12 | Medium | Medium | Document blocker; recommend alternative | Squad | Open |
| R-6 | Switching backend routes to variable `proxy_pass` regresses path rewriting (`/control/`, `/editor/`, `/ros`, `/novnc`, `/terminal`) | Medium | Medium | Preserve exact trailing-slash/rewrite semantics per route; add a proxied-path acceptance test per route; keep SPA + control statically resolved | Squad | Open |

## 11. Privacy, Security & Compliance
### Data Classification
Developer credentials (GitHub Copilot token) — sensitive; workspace settings — low sensitivity.
### PII Handling
No end-user PII beyond the developer's own GitHub identity/token stored locally on a volume.
### Threat Considerations
Token theft from a shared or exported volume; multi-tenant leakage if data is not user-scoped.
Decision: rely on volume permissions this iteration and document the risk; encrypt tokens at rest
before any non-localhost or multi-user exposure (do not over-engineer now).
### Regulatory / Compliance (Conditional)
| Regulation | Applicability | Action | Owner | Status |
|-----------|--------------|--------|-------|--------|
| N/A | Local dev tool | None | — | — |

## 12. Operational Considerations
| Aspect | Requirement | Notes |
|--------|------------|-------|
| Deployment | New named volumes for code-server and the server-side config store | Compose change |
| Rollback | Remove volumes/flags to revert; native pop-out is additive | |
| Monitoring | Reuse control-service health; verify tmux sessions | |
| Alerting | None new this iteration | |
| Support | Document pop-out/dock-back and config in README | |
| Capacity Planning | Volume growth for editor data/extensions | Minor |

## 13. Rollout & Launch Plan
### Phases / Milestones
| Phase | Date | Gate Criteria | Owner |
|-------|------|--------------|-------|
| A. Native pop-out + dock-back | TBD | FR-A1..A6 pass; history preserved | Squad |
| B. Terminal affinity | TBD | FR-B1..B4 pass | Squad |
| C. Config dialog + persistence | TBD | FR-C1..C5 pass | Squad |
| D. Editor persistence | TBD | FR-D1..D4 pass | Squad |
| E. GPU spike (+impl) | TBD | FR-E1..E3 outcome documented | Squad |
| G. Resilient ingress + health view | TBD | FR-G1..G4 pass; UI loads before heavy services; restart-from-UI recovers a service | Squad |
### Design & Decision Cadence (Optional)
Metrics, risks, and operationalization are not front-loaded; each is finalized at the theme's
**design gate** (the research/plan step immediately before implementation). Instrumentation is
added during implementation and verified at the phase review. The GPU metric stays open until the
Theme E spike concludes.

| Phase (theme) | Metrics finalized | Risks reviewed | Operationalization decided |
|---------------|-------------------|----------------|----------------------------|
| A. Native pop-out | Terminal-state-loss = 0; popout/dock-back events | R-1, R-2 | None new (additive; no volume) |
| B. Terminal grouping | Affinity enforced; `+` only on terminal-only stacks | R-3 | None new |
| C. Config store | A setting survives reload + restart | Config endpoint/volume | Config volume + `config.json` path & schema (user key reserved); rollback |
| D. Editor persistence | 0 Copilot re-logins after restart | R-4 (token at rest) | code-server volume paths; per-user structure; secret handling |
| F. Minimize | Collapse-to-header + restore works | Low | None new |
| E. GPU spike | Renderer != llvmpipe (spike-dependent) | R-5 | WSL overlay change + write-up |
| G. Resilient ingress | UI usable before ros/sim/vnc/editor healthy; per-service health visible | R-6 (proxy_pass URI) | Proxy `depends_on` control+frontend only; nginx resolver + graceful 5xx pages; SPA/control stay static |
### Feature Flags (Conditional)
| Flag | Purpose | Default | Sunset Criteria |
|------|---------|--------|----------------|
| terminal-affinity | Toggle docking affinity | on | Kept as a setting |
### Communication Plan (Optional)
README + BRD/PRD updates; note behavior changes to pop-out.

## 14. Open Questions
| Q ID | Question | Owner | Deadline | Status |
|------|----------|-------|---------|--------|
| Q-1 | Multi-user now (per-user isolation) or single-user with a clear extension path? | jmservera | 2026-07-19 | Resolved: single-user now; schema reserves a user key for later isolation |
| Q-2 | Config store: client-only localStorage vs server-side via control service? Which settings are per-browser vs system? | jmservera | 2026-07-19 | Resolved: server-side via control service for system settings; per-browser prefs may stay in localStorage |
| Q-3 | Which settings must the first config dialog expose beyond affinity? | jmservera | 2026-07-19 | Resolved: default layout, simulator GPU adapter, theme, auth-mode display, affinity/grouping toggle, plus reset-to-defaults |
| Q-4 | Dock-back UX: `popInOnClose`, explicit control, or both? | jmservera | 2026-07-19 | Resolved: manual pop-in control (`popInOnClose: false` + `checkAddDefaultPopinButton()`); revised 2026-07-20 — auto-dock-on-close was erratic on passive panels |
| Q-5 | Affinity granularity: simple on/off vs general per-type grouping policy? | jmservera | 2026-07-19 | Resolved: per-type grouping policy; only terminals grouped now, other panels ungrouped |
| Q-6 | Copilot token at rest: volume perms sufficient or encryption required before non-localhost exposure? | jmservera | 2026-07-19 | Resolved: volume perms now + documented risk; encryption required before non-localhost/multi-user |

## 15. Changelog
| Version | Date | Author | Summary | Type |
|---------|------|-------|---------|------|
| 0.1.0 | 2026-07-19 | jmservera | Initial draft from BRD + implementation discussion | Draft |
| 0.2.0 | 2026-07-19 | jmservera | Resolved config storage (server-side), multi-user timing (single-user now), dock-back UX (auto-dock on close) | Update |
| 0.3.0 | 2026-07-19 | jmservera | Resolved config settings (+reset), per-type grouping, token-at-rest; added panel minimize/collapse (G-007/FR-F1); appendix manual-test note | Update |
| 1.0.0 | 2026-07-19 | jmservera | Approved; panel minimize/collapse (G-007/FR-F1) promoted to Must; reconciled with BRD | Approved |
| 1.0.1 | 2026-07-19 | jmservera | Added design & decision cadence (metrics/risks/ops finalized per theme at its design gate); collapse-to-header UX | Update |
| 1.1.0 | 2026-07-20 | jmservera | Added Section 18 Architecture Enhancements (pending tasks AE-S1..AE-G1) from the 2026-07-20 System Architecture Review across ADRs, open issues (#10/#12/#15), and theme PRs (#5/#6/#7/#13/#14) | Update |
| 1.2.0 | 2026-07-20 | jmservera | Added Theme G resilient ingress & health visibility (G-008/FR-G1..G4, NFR-8, R-6): proxy depends only on control+frontend, lazy nginx upstream resolution, in-GUI service health view + guided recovery | Update |

## 16. References & Provenance
| Ref ID | Type | Source | Summary | Conflict Resolution |
|--------|------|--------|---------|--------------------|
| REF-1 | BRD | docs/brds/uberos-workspace-enhancements-brd.md | Business requirements for the 5 themes | Authoritative for business intent |
| REF-2 | BRD | docs/brds/uberos-workspace-management-brd.md | Prior milestone requirements | Prior context |
| REF-3 | PRD | docs/prds/uberos-init.md | Init constraints (single proxy, ports internal) | Constraint source |
| REF-4 | Library | https://github.com/golden-layout/golden-layout | Native pop-out/pop-in (`browser-popout.ts`), sub-window via `?gl-window=` | Reuse decision basis |
| REF-5 | Spec | docs/specs/03-intel-openvino-research.md | WSL2 `/dev/dxg` GPU passthrough context | GPU spike basis |
### Citation Usage
The pop-out reuse decision (FR-A1..A6) is grounded in REF-4; GPU spike (FR-E) in REF-5.

## 17. Appendices (Optional)
### Glossary
| Term | Definition |
|------|-----------|
| Pop-out | Detaching a panel into its own browser window |
| Pop-in / dock-back | Returning a popped-out panel to the main canvas |
| Affinity | Rule constraining which panel types may share a stack |
| tmux session id | Stable id in `/terminal/?arg=<id>` that reattaches the same shell |
### Additional Notes
Terminal `tmux` persistence and the frontend `+`/window changes are already implemented. The
agent's automated ROS image rebuild (tmux/ttyd) was failing at the time, so the owner rebuilt the
ROS image manually and has been running manual tests to validate behavior before giving feedback.

## 18. Architecture Enhancements (Pending)
This section captures architecture-level enhancements from the 2026-07-20 System Architecture
Review. The review examined the running eight-service topology, ADRs 001-005, the open issues
(#10 tmux scroll, #12 VNC lag, #15 security/quality), the security-and-quality review request, and
the open theme PRs (#5 Theme E GPU spike, #6 Theme A pop-out, #7 Theme B affinity, #13 CI/CD,
#14 Theme D editor persistence). Scope was security-forward per issue #15, then reliability and
operability, then the display-pipeline performance ceiling and multi-user readiness. Each item
below is a **pending task**; none are yet scheduled into a theme design gate. Priorities use the
same Must/Should/Could scale as the functional requirements.

### AE Summary
| AE ID | Pillar | Enhancement | Priority | Refs |
|-------|--------|------------|----------|------|
| AE-S1 | Security | Constrain the control plane's Docker socket behind a read-scoped socket-proxy sidecar | Must | control service, R-4, #15 |
| AE-S2 | Security | Add supply-chain/SAST scanning to CI (CodeQL, Trivy image scan, npm audit + Dependabot, secret scan) | Must | #15, PR #13 |
| AE-S3 | Security | Enforce WebSocket origin allowlisting at the proxy; design authenticated rosbridge before multi-user | Should | ADR-002, ADR-005 |
| AE-S4 | Security | Encrypt the Copilot/editor token at rest before non-localhost or multi-user exposure | Should | R-4, FR-D4, PR #14 |
| AE-S5 | Security | Add proxy security headers (CSP, frame-ancestors, HSTS) and defense-in-depth editor auth | Should | ADR-002, editor |
| AE-R1 | Reliability | Health-driven panel degradation and reconnect in the SPA when a backend is unhealthy | Should | control /services |
| AE-R2 | Reliability | Backup/restore and volume-migration strategy for persisted volumes and the config store | Should | NFR-7, FR-C, FR-D |
| AE-O1 | Operability | Centralized log aggregation and an aggregated health/metrics surface across the services | Should | Section 8, control |
| AE-O2 | Operability | Version the config-store schema with a migration path (reserve `schemaVersion`) | Must | FR-C2, FR-C4 |
| AE-O3 | Operability | Wire the defined instrumentation events (popout/dock-back/config-save) to a telemetry sink | Could | Section 8 |
| AE-P1 | Performance | Evaluate a damage-aware capture server or GPU-encode WebRTC path vs x11vnc screen-scrape (ADR) | Should | #12, PR #5 |
| AE-P2 | Performance | Add config-driven adaptive resolution/quality for the simulator stream | Could | #12 |
| AE-M1 | Scalability | Document the target multi-user blueprint (per-user session, DDS domain, workspace/volume isolation) | Should | Q-1, ADR-001, ADR-005 |
| AE-G1 | Governance | Author ADRs for the newly significant decisions (socket control plane, persistence, display transport, GPU rejection, observability) | Must | ADR-001..005, PR #5 |

### Pending Tasks
Security (issue #15 focus):

* [ ] AE-S1 (Must): Place a read-scoped `docker-socket-proxy` sidecar in front of the control service so container-escape surface does not rest on the app-layer allowlist alone; the control plane keeps only the list-containers and restart-container verbs it needs.
* [ ] AE-S2 (Must): Extend CI (PR #13) with supply-chain and SAST scanning: CodeQL for the JavaScript services, Trivy image scanning for the seven Dockerfiles, `npm audit` plus Dependabot for dependency alerts, and secret scanning. Directly answers issue #15.
* [ ] AE-S3 (Should): Enforce WebSocket `Origin` allowlisting at the Nginx proxy and design an authenticated rosbridge path (token or proxy-injected identity) before any multi-user exposure, since rosbridge `check_origin` returns true unconditionally.
* [ ] AE-S4 (Should): Encrypt the Copilot/editor token at rest via a secret backend before non-localhost or multi-user exposure; this promotes risk R-4 and FR-D4 from documented-risk to implemented control.
* [ ] AE-S5 (Should): Add proxy security headers (CSP scoped to the iframe panels, `frame-ancestors`, and HSTS once TLS terminates at the proxy) and replace code-server `--auth none` with a defense-in-depth auth layer that does not rely solely on the proxy.

Reliability:

* [ ] AE-R1 (Should): Define health-driven panel degradation in the SPA, consuming the control `/services` health already exposed, so an unhealthy simulator, vnc, or ros surfaces a clear fallback and auto-reconnect instead of a broken iframe. Now scoped concretely as Theme G (FR-G3/FR-G4).
* [ ] AE-R2 (Should): Add a backup/restore and migration strategy for the persisted volumes (`editor-data`, `editor-config`, and the config store); NFR-7 covers survival across restart but not disaster recovery or forward migration.

Operability and Observability:

* [ ] AE-O1 (Should): Add centralized log aggregation and an aggregated health/metrics surface across the eight services; today only per-container healthchecks and the control status endpoint exist.
* [ ] AE-O2 (Must): Version the config-store schema with a migration path, reserving a `schemaVersion` key alongside the already-reserved user key (FR-C4), so config format changes stay forward-compatible.
* [ ] AE-O3 (Could): Connect the instrumentation events defined in Section 8 (popout, dock-back, config-save) to an actual telemetry sink; they are specified but have no delivery mechanism.

Performance:

* [ ] AE-P1 (Should): Treat the simulator display pipeline as a strategic architectural decision. Evaluate a damage-aware capture server (TurboVNC or KasmVNC) or a GPU-encode WebRTC path against the current x11vnc screen-scrape, and record the outcome in an ADR. Builds on issue #12 and the PR #5 spike finding.
* [ ] AE-P2 (Could): Add config-driven adaptive resolution and quality for the simulator stream, generalizing the issue #12 L2/L4 levers into a runtime setting.

Scalability and Multi-tenancy:

* [ ] AE-M1 (Should): Document the target multi-user architecture blueprint (per-user session isolation, per-user DDS domain or discovery server, and per-user workspaces and volumes) so the reserved user key in the persistence schema has a concrete architecture behind it.

Governance:

* [ ] AE-G1 (Must): Author ADRs for the decisions that became architecturally significant this iteration: the socket-mounted control plane, the persistence and volume strategy, the display/VNC transport, the GPU rejection for the interactive path, and observability.

Generated 2026-07-19 by PRD Builder (mode: refine)
<!-- markdown-table-prettify-ignore-end -->
