<!-- markdownlint-disable-file -->
<!-- markdown-table-prettify-ignore-start -->
# UbeROS - Product Requirements Document (PRD)
Version 0.2.0 | Status Draft | Owner jmservera | Team Squad (Morpheus, Neo, Trinity, Switch, Tank) | Target Init Milestone (no fixed date) | Lifecycle Research → Planning

## Progress Tracker
| Phase | Done | Gaps | Updated |
|-------|------|------|---------|
| Context | 100% | Product decisions U-D1..U-D4 confirmed | 2026-07-17 |
| Problem & Users | 100% | Single-user Init; multi-user not precluded | 2026-07-17 |
| Scope | 100% | Default overrides confirmed (C-07 = Chrome/Edge only) | 2026-07-17 |
| Requirements | 90% | Requirements confirmed; priorities inherited | 2026-07-17 |
| Metrics & Risks | 70% | N-08 streaming targets deferred by decision | 2026-07-17 |
| Operationalization | 50% | Rollout, CI gates, platform matrix ownership | 2026-07-17 |
| Finalization | 60% | Ready for validation review | 2026-07-17 |
Unresolved Critical Questions: 0 | TBDs: 3

## 1. Executive Summary
### Context
Setting up a ROS development environment requires installing a specific Linux distribution, managing complex dependency chains, configuring GPU passthrough, and running multiple GUI applications. This friction slows onboarding, limits collaboration, and ties developers to a specific workstation.

### Core Opportunity
Deliver a complete, containerized ROS robotics workspace — physics simulators, code editors, and debugging tools — accessible entirely from a standard web browser with no local install beyond Docker. A single `docker compose up` launches the full stack.

### Goals
| Goal ID | Statement | Type | Baseline | Target | Timeframe | Priority |
|---------|-----------|------|----------|--------|-----------|----------|
| G-01 | Run a full ROS stack (nodes, topics, services, parameters) inside Docker Compose | Capability | None | Functional ROS graph reachable in browser | Init | Must |
| G-02 | Run a physics simulator headlessly and stream its GUI to the browser | Capability | None | Simulator GUI visible via noVNC panel | Init | Must |
| G-03 | Provide a self-hostable browser code editor with ROS workspace access | Capability | None | Editor opens, edits, saves in workspace | Init | Must |
| G-04 | Offer multiple terminal sessions to the primary ROS container | Capability | None | ≥2 independent browser PTYs | Init | Must |
| G-05 | Present a canvas window manager with drag, resize, minimize | Capability | None | Panels respond to all three gestures | Init | Must |
| G-06 | Allow any panel to pop out to a separate window without terminating its workload | Capability | None | Pop-out isolation verified (INV-01) | Init | Must |
| G-07 | Expose all services behind a single reverse proxy | Capability | None | Single ingress, all subpaths route | Init | Must |

### Objectives (Optional)
| Objective | Key Result | Priority | Owner |
|-----------|------------|----------|-------|
| Zero-install onboarding | New developer runs the full stack with only Docker installed | Must | Trinity |
| Evidence-backed decisions | All four blocking product decisions recorded as ADRs | Must | Morpheus |

## 2. Problem Definition
### Current Situation
ROS development is tied to specific workstations with hand-configured Linux, dependency chains, GPU passthrough, and multiple native GUI apps.

### Problem Statement
The setup friction of a native ROS environment slows onboarding, limits collaboration, and prevents portable, browser-based development.

### Root Causes
* Native ROS/Gazebo installs require a specific Linux distribution and complex dependency management.
* GUI applications (simulator, editor, terminals) assume a local display server.

### Impact of Inaction
Developers remain locked to individual workstations, onboarding stays slow, and collaboration across machines and platforms stays difficult.

## 3. Users & Personas
> Init serves a single user, but no design choice may preclude a future multi-user model (see Constraints and assumption A-1).

| Persona | Goals | Pain Points | Impact |
|---------|-------|------------|--------|
| ROS Developer (primary, single-user for Init) | Write, build, and test ROS nodes; observe results in simulation | Slow environment setup; workstation lock-in | Faster onboarding, portable workflow |
| Platform Maintainer | Stand up and operate the stack; add ROS packages | Complex dependency and networking setup | Repeatable, Compose-defined environment |

### Journeys (Optional)
* J1 First Launch: `docker compose up`, open a URL, see the canvas with ROS status, simulator, editor, and terminal panels.
* J2 Code-Build-Test: edit a node in the editor, build with `colcon` in a terminal, observe the effect in the simulator.
* J3 Multi-Screen: pop out the simulator panel to a second monitor; the workload keeps running.
* J4 Session Lifecycle: `docker compose down` stops workloads; volumes preserve workspace and configuration on next `up`.

## 4. Scope
### In Scope
* Full ROS stack, headless simulator with GUI streaming, browser code editor, multiple terminals, canvas window manager, pop-out, and single reverse proxy — all via Docker Compose.
* Localhost-only acceptance for S1–S6; named-volume persistence; software rendering by default.

### Out of Scope (Init)
* Terminal process/shell-history continuity across container restarts (OOS-01).
* Streaming FPS/latency thresholds (OOS-02, deferred to N-08 research).
* Multi-user RBAC / session isolation (OOS-03).
* Foxglove Bridge, Fuel model licensing, Git LFS, rosbridge QoS tuning, camera streaming, TLS on localhost (OOS-04..OOS-09).

### Assumptions
* Single-user for Init; no session isolation required now, but the architecture must not preclude a future multi-user model (A-1).
* S1–S6 acceptance is localhost-only; authentication is required before any non-localhost exposure (A-2).
* Docker Compose V2 (`docker compose`) is the orchestration layer (A-3).
* `workspace/src/` is bind-mounted; build artifacts use named volumes (A-4).
* Gazebo GUI is never headless by default because S4 requires a visible GUI (A-5).

### Constraints
* Host requires nothing beyond Docker.
* Backend service ports (rosbridge 9090, ttyd 7681) must never be host-published.
* Single-user Init must not block future multi-user: avoid hard-coding a single global session, keep proxy auth extensible to per-user identity, and keep workspace/volume layout compatible with future per-user scoping.
* Supported browsers for Init: latest stable Chrome and Edge only (Firefox and Safari out of scope for Init).

## 5. Product Overview
### Value Proposition
A portable, browser-delivered ROS environment that launches with one command and requires no local install beyond Docker.

### Differentiators (Optional)
* Single-command startup with a unified browser canvas.
* Pop-out panels for multi-screen use without disrupting workloads.

### UX / UI (Conditional)
Canvas-style window manager with drag, resize, minimize, tabs, and pop-out. First-launch layout shows four panels: ROS Status, Simulator (noVNC), Terminal, Code Editor. Frontend: Svelte + Golden Layout v2. Supported browsers: latest stable Chrome and Edge. UX Status: Framework confirmed (U-D4).

## 6. Functional Requirements
| FR ID | Title | Description | Goals | Personas | Priority | Acceptance | Notes |
|-------|-------|------------|-------|----------|----------|-----------|-------|
| F-01 | ROS stack in Compose | Full ROS stack runs in Docker Compose | G-01 | ROS Developer | Must | `ros2 node list` responds | WP-2, WP-5 |
| F-02 | Headless simulator | Physics simulator runs without a host display | G-02 | ROS Developer | Must | `pgrep gz` exits 0 | WP-3, WP-5 |
| F-03 | Simulator GUI streaming | Simulator GUI streams through noVNC | G-02 | ROS Developer | Must | `/novnc/websockify` upgrades; S4 passes | WP-3, WP-4, WP-6 |
| F-04 | Browser code editor | Self-hostable editor with workspace access | G-03 | ROS Developer | Must | `GET /editor/` returns 200; S6 passes | WP-7, WP-11 |
| F-05 | Multiple terminals | Independent browser terminal sessions | G-04 | ROS Developer | Must | ≥2 concurrent PTYs with independent processes | WP-8, WP-6 |
| F-06 | Canvas window manager | Drag, resize, minimize panels | G-05 | ROS Developer | Must | S2 passes; all three gestures work | WP-9 |
| F-07 | Pop-out isolation | Pop out a panel without terminating its workload | G-06 | ROS Developer | Must | S5 and INV-01 pass | WP-9, WP-10 |
| F-08 | Single reverse proxy | One proxy provides path routing | G-07 | Platform Maintainer | Must | Root 200; all subpaths route | WP-6 |
| F-09 | Compose topology | Compose defines services, networks, volumes | G-01 | Platform Maintainer | Must | `docker compose config --quiet` exits 0 | WP-10 |
| F-10 | Clean startup | `docker compose up` starts without error | G-01 | Platform Maintainer | Must | All services healthy within 120s | WP-10, WP-12 |
| F-11 | Canvas with panel | Browser shows canvas with ≥1 panel | G-05 | ROS Developer | Must | Root 200; DOM has ≥1 `iframe[src]` | WP-6, WP-9 |
| F-12 | ROS command in terminal | A ROS command runs in a browser terminal | G-04 | ROS Developer | Must | `ros2 topic list` returns within 5s | WP-8, WP-9 |
| F-13 | Simulator GUI in noVNC | Simulator GUI visible in the noVNC panel | G-02 | ROS Developer | Must | Non-blank frame within 30s; no `--headless-rendering` | WP-3, WP-4, WP-6 |
| F-14 | Pop-out continuity | Panel opens separately while its session continues | G-06 | ROS Developer | Must | `window.open()` succeeds; services remain running | WP-9 |
| F-15 | Editor persistence | Editor opens, edits, and saves in the workspace | G-03 | ROS Developer | Must | Saved file readable from the ROS container | WP-7, WP-11 |
| F-16 | Default layout | First launch shows four default panels | G-05 | ROS Developer | Should | Four panels render with empty `localStorage` | WP-9 |
| F-17 | colcon in terminal | `colcon` usable from the terminal panel | G-04 | ROS Developer | Must | `colcon build --help` exits 0 | WP-2, WP-8 |

### Feature Hierarchy (Optional)
```plain
UbeROS
├── Compose stack (proxy, ros, simulator, vnc, editor, frontend, discovery-server)
├── Browser canvas (window manager + four panels)
├── Persistence (named volumes + bind-mounted workspace/src)
└── Security baseline (proxy auth, internal-only backend ports)
```

## 7. Non-Functional Requirements
| NFR ID | Category | Requirement | Metric/Target | Priority | Validation | Notes |
|--------|----------|------------|--------------|----------|-----------|-------|
| N-01 | Reliability | Volumes preserve data across restarts | File written before `down` remains after `up` | Must | Persistence test (WP-11) | INV-02 |
| N-02 | Portability | Host requires no software beyond Docker | Fresh host with Docker runs `docker compose up` | Must | Platform matrix (WP-14) | INV-03 |
| N-03 | Maintainability | Service boundaries reflect lifecycle/security/resources | Services remain distinct and single-purpose | Should | Compose review (WP-10) | — |
| N-04 | Extensibility | Adding a ROS package needs only Dockerfile/Compose edits | New service layer builds in CI | Should | CI build (WP-2, WP-10) | — |
| N-05 | Security | Authentication precedes public exposure | Unauthenticated requests return 401 with `UBEROS_AUTH=basic` | Must | Security gate (WP-13) | — |
| N-06 | Observability | Logs aggregated; every service has a health check | `docker compose logs` covers all services; health checks pass | Must | CI (WP-10, WP-12) | — |
| N-07 | Portability | Linux, macOS Docker Desktop, WSL2 validation matrix | Each tier has documented pass/fail results | Should | Platform matrix (WP-14) | — |
| N-08 | Performance | Streaming performance targets are a research deliverable | Targets defined in later research phase | Deferred | N/A for Init | Owner: Morpheus |
| N-09 | Compatibility | Supported browsers for Init | Latest stable Chrome and Edge render the canvas and all panels | Should | Browser E2E (WP-15) | Firefox/Safari out of scope for Init |

## 8. Data & Analytics (Conditional)
Not applicable for Init. No analytics or telemetry are in scope.

## 9. Dependencies
| Dependency | Type | Criticality | Owner | Risk | Mitigation |
|-----------|------|------------|-------|------|-----------|
| ROS base image (`ros:${ROS_DISTRO}-ros-base`) | Upstream image | Critical | Neo | Distro package coverage (Kilted) | SPIKE-A verification; Jazzy fallback |
| Gazebo image (`ghcr.io/openrobotics/gazebo:${GZ_RELEASE}-full`) | Upstream image | Critical | Neo | Image availability | SPIKE-A P3; Harmonic fallback |
| rosbridge_suite | ROS package | Critical | Neo | Kilted package availability | SPIKE-A P2; build from source |
| Fast DDS discovery | Networking | Critical | Neo | Silent multicast discovery failure | Explicit discovery server (WP-5) |
| ttyd binary | Terminal transport | High | Trinity/Switch | Architecture mismatch (arm64) | Pin binary; select by `TARGETARCH` |

## 10. Risks & Mitigations
| Risk ID | Description | Severity | Likelihood | Mitigation | Owner | Status |
|---------|-------------|---------|-----------|-----------|-------|--------|
| RISK-1 | Kilted ecosystem gaps (rosbridge, ros-gz) | High | Medium | SPIKE-A passed 2026-07-17: rosbridge-suite 4.2.0, ros-gz 3.0.9 available; Jazzy fallback retained | Neo | Mitigated |
| RISK-2 | Ogre2 software-rendering crash | High | Low | Mesa overrides; wait for Xvfb; Jazzy fallback | Neo | Open |
| RISK-4 | Silent DDS discovery failure | Critical | High | Fast DDS discovery server (WP-5) | Neo | Open |
| RISK-7 | ttyd architecture mismatch | High | Medium | Pin ttyd; `TARGETARCH` selection | Trinity | Open |
| RISK-10 | Volume loss via `docker compose down -v` | Critical | Low | Prominent warning; guarded script | Trinity | Open |

## 11. Privacy, Security & Compliance
### Data Classification
No personal or sensitive data in Init. Workspace source code is user-owned.

### PII Handling
Not applicable for Init (single-user, localhost).

### Threat Considerations
rosbridge has no native authentication (`check_origin` always true); backend ports must stay internal and be gated at the proxy. Auth is required before any non-localhost exposure.

### Regulatory / Compliance (Conditional)
| Regulation | Applicability | Action | Owner | Status |
|-----------|--------------|--------|-------|--------|
| None identified for Init | N/A | N/A | Morpheus | N/A |

## 12. Operational Considerations
| Aspect | Requirement | Notes |
|--------|------------|-------|
| Deployment | `docker compose up` on any Docker host | Localhost-only for Init |
| Rollback | `docker compose down` (retains volumes) | Avoid `-v` (destructive) |
| Monitoring | `docker compose logs`; per-service health checks | N-06 |
| Alerting | Not in Init scope | TBD |
| Support | Single-user, self-hosted | TBD |
| Capacity Planning | Minimum 2 concurrent terminals | C-05 |

## 13. Rollout & Launch Plan
### Phases / Milestones
| Phase | Date | Gate Criteria | Owner |
|-------|------|--------------|-------|
| SPIKE-A | Day 1 | Kilted/Ionic verification recorded in ADR-001 | Neo |
| Scaffolding (WP-0) | Day 1–2 | `docker compose config` parses | Trinity |
| Components | Day 3–5 | ROS, simulator, proxy, editor, terminal, frontend built | Squad |
| Integration (WP-10) | After components | All services healthy within 120s | Trinity |
| Acceptance (WP-15) | Final | S1–S6 pass | Tank |
| Platform matrix (WP-14) | After acceptance | Tier results documented | Tank/Trinity |

### Feature Flags (Conditional)
| Flag | Purpose | Default | Sunset Criteria |
|------|---------|--------|----------------|
| UBEROS_AUTH | Proxy-level basic auth | off (localhost) | Required before public exposure |
| compose.override.gpu.yaml | NVIDIA acceleration opt-in | off | Kept as optional overlay |

### Communication Plan (Optional)
TBD.

## 14. Open Questions
| Q ID | Question | Owner | Deadline | Status |
|------|----------|-------|---------|--------|
| U-D1 | ROS 2 distribution | jmservera / Neo | Before WP-0 | Resolved — Kilted (SPIKE-A passed; Jazzy fallback) |
| U-D2 | Reverse proxy | jmservera / Trinity | Before WP-0 | Resolved — Nginx |
| U-D3 | Terminal transport | jmservera / Switch | Before WP-2/WP-9 | Resolved — ttyd inside ROS container |
| U-D4 | Frontend framework + window manager | jmservera / Switch | Before WP-9 | Resolved — Svelte + Golden Layout v2 |
| C-01 | Default proxy port | jmservera | Before WP-6 | Resolved — 8080 |
| C-06 | Editor product | jmservera | Before WP-7 | Resolved — code-server |
| C-07 | Browser support | jmservera | Before WP-9 | Resolved — Chrome/Edge only (Firefox dropped) |
| C-09 | Simulation world | jmservera | Before WP-3 | Resolved — built-in Gazebo shapes |
| N-08 | Streaming performance targets (FPS/latency) | Morpheus | Later research phase | Deferred by decision |

## 15. Changelog
| Version | Date | Author | Summary | Type |
|---------|------|-------|---------|------|
| 0.1.0 | 2026-07-17 | PRD Builder | Initial draft from spec 01-Init.md and 01-Init-research.md | Created |
| 0.2.0 | 2026-07-17 | PRD Builder | Resolved U-D1..U-D4 and defaults; C-07 narrowed to Chrome/Edge; single-user Init must not preclude multi-user; N-08 deferred; no fixed date | Updated |

## 16. References & Provenance
| Ref ID | Type | Source | Summary | Conflict Resolution |
|--------|------|--------|---------|--------------------|
| REF-1 | Spec | docs/specs/01-Init.md | Canonical project brief; source of truth for scope | Precedence over research |
| REF-2 | Research | docs/specs/01-Init-research.md | Implementation guidance and decision analysis | Subordinate to spec |
| REF-3 | External | ROS Kilted release page | Kilted feature and release evidence | Verify via SPIKE-A |

### Citation Usage
Goals and requirements derive from spec §3, §7, §10; requirement IDs and work-package mapping derive from the research report's traceability tables.

## 17. Appendices (Optional)
### Glossary
| Term | Definition |
|------|-----------|
| noVNC | Browser-side WebSocket/VNC bridge for streaming GUIs |
| rosbridge | WebSocket bridge exposing the ROS graph to browsers |
| ttyd | WebSocket PTY server providing browser terminals |
| DDS | Data Distribution Service, ROS 2 middleware transport |
| SPIKE-A | Mandatory Kilted/Ionic image and package verification |

### Additional Notes
Spec-locked decisions (D1–D11) and deferred questions (D-01..D-09) from the research report are treated as settled and are not reopened during Init.

Generated 2026-07-17 by PRD Builder (mode: guided)
<!-- markdown-table-prettify-ignore-end -->
