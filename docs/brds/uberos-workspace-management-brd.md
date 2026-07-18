---
title: UberOS Workspace Management and Controls BRD
description: Business requirements for panel recovery, terminal session management, an operational system menu, optional authentication, and hardware/streaming research spikes.
author: jmservera
ms.date: 07/18/2026
ms.topic: concept
---

# UberOS Workspace Management and Controls BRD

Version 0.1.0 | Status Draft | Owner jmservera | Related PRD [uberos-init](../prds/uberos-init.md)
## Progress Tracker

| Phase | Done | Gaps | Updated |
|-------|------|------|---------|
| Context | 100% | Initiative framing confirmed | 2026-07-18 |
| Problem & Drivers | 100% | Bugs-first priority confirmed | 2026-07-18 |
| Objectives & Metrics | 90% | Targets confirmed (pop-out qualitative) | 2026-07-18 |
| Stakeholders | 100% | Team-level ownership (owner jmservera, delivery Squad) | 2026-07-18 |
| Scope | 100% | Research vs implement decided per spike | 2026-07-18 |
| Requirements | 95% | Acceptance criteria ready for validation | 2026-07-18 |

## 1. Business Context and Background

UberOS delivers a browser-based ROS development environment through a Golden Layout
canvas of dockable panels (Simulator/noVNC, Terminal, Code Editor, ROS Status) served
behind a single Nginx reverse proxy. The Init milestone is functional: the full stack
launches with `docker compose up` and panels support drag, resize, minimize, tabs, and
pop-out.

With the core experience working, day-to-day use has surfaced usability gaps and defects
that reduce operator confidence: closed panels cannot be recovered, pop-out windows render
empty, terminal creation is limited, there is no central control surface for the workspace,
and the documented optional authentication is not actually wired into the proxy. Two open
technical questions — streaming smoothness and GPU/accelerator compatibility — also need
evidence before further investment.

This BRD captures the business needs for a coordinated workspace-management and operational-
controls improvement, plus two research spikes, while preserving the Init constraints
(single reverse proxy, backend ports internal, single-user now but multi-user not precluded).

## 2. Problem Statement and Business Drivers

### Problem Statement

Operators cannot reliably manage their UberOS workspace: they lose panels with no recovery
path, cannot use pop-out windows effectively, cannot freely create and arrange terminals,
and have no central place to control layout, service health, or session/authentication.
These gaps erode trust in the environment and slow the develop-build-test loop.

### Business Drivers

| Driver | Description |
|--------|-------------|
| Operator productivity | Reduce friction and lost work in the daily ROS develop-build-test loop. |
| Reliability and recovery | Provide recovery paths when panels are closed or services become unresponsive. |
| Extensibility | Establish a control surface that future capabilities (multi-user, bag record/replay) can plug into without rework. |
| Security readiness | Make the documented optional authentication real and toggleable ahead of any non-localhost exposure. |
| Evidence-based decisions | De-risk streaming smoothness and hardware acceleration choices with structured research. |

## 3. Business Objectives and Success Metrics

| Objective ID | Objective | KPI / Success Metric | Baseline | Target | Timeframe | Priority |
|--------------|-----------|----------------------|----------|--------|-----------|----------|
| BO-1 | No workspace state is unrecoverable | A closed panel can always be reopened from a control | Not possible today | 100% of panel types reopenable | This iteration | Must |
| BO-2 | Pop-out windows are fully usable | Popped-out panel shows live content without a dock/undock workaround | Empty on pop-out | Content visible on pop-out (qualitative) | This iteration | Must |
| BO-3 | Flexible terminal management | Operator can create N terminals and dock/undock/pop-out each | Fixed set, no + control | Create, dock-together, undock, and pop-out terminals | This iteration | Must |
| BO-4 | Central operational control | Menu exposes show/hide, layouts, service reset, and logout | No menu | Menu present with all four control groups | This iteration | Must |
| BO-5 | Optional authentication is real | `UBEROS_AUTH` toggles proxy auth without code edits | Documented but inert | Toggle enables/disables auth via `.env` | This iteration | Should |
| BO-6 | Evidence for streaming and hardware | Documented research comparing Guacamole vs noVNC and Intel/OpenVINO feasibility; implement OpenVINO if feasible | None | Guacamole research write-up; OpenVINO write-up plus implementation if feasible | This iteration | Should |

## 4. Stakeholders and Roles

| Stakeholder | Role | Interest |
|-------------|------|----------|
| jmservera | Product owner / sponsor | Prioritizes work, accepts deliverables |
| ROS Developer (primary persona) | End user | Daily workspace usability and recovery |
| Platform Maintainer | Operator | Service reset, layout, auth configuration |
| Squad (Morpheus, Neo, Trinity, Switch, Tank) | Delivery team | Design and implementation |

> TODO: Confirm which stakeholder owns/reviews each requirement.

## 5. Scope

### In Scope

- Panel recovery via a control surface (reopen closed panels/tabs).
- Fix for empty pop-out windows.
- Terminal session management (create, dock together, undock, pop-out).
- A workspace system menu: show/hide windows, predefined layouts, service reset, logout.
- Menu extensibility hooks for future features (multi-user, bag record/replay).
- Optional proxy authentication toggled by `.env` (`UBEROS_AUTH`), with logout clearing credentials.
- Guacamole vs noVNC research spike as a documented deliverable (research only).
- Intel GPU/OpenVINO research spike, plus implementation of the OpenVINO overlay if feasible.

### Out of Scope

- Implementing multi-user identity, self-service user management, or bag record/replay in this iteration (menu must only leave room for them).
- Implementing Guacamole in this iteration; if the research concludes it is better, implementation is a separately approved future improvement.
- Changing the single-reverse-proxy topology or host-publishing backend ports.

### Assumptions

- Init constraints hold: single ingress, backend ports internal, single-user now with multi-user not precluded (PRD A-1, A-2).
- Golden Layout v2 remains the window manager (ADR-004).
- Nginx `auth_basic` remains the Init auth mechanism (ADR-005); OAuth2-Proxy is a later upgrade.

## 6. Current and Future Business Processes

### Current State

- Closing a panel/tab removes it permanently; the only reset is clearing saved layout or reloading defaults.
- Pop-out opens a browser window that renders empty until the panel is re-docked.
- Terminals are a fixed set; there is no control to spawn a new session.
- There is no menu; layout, service health, and auth are managed outside the UI.
- `UBEROS_AUTH=basic` and an `.htpasswd` have no effect because the proxy `auth_basic` lines are commented out.

### Future State

- A control (menu) lists all panels and lets the operator reopen any closed panel.
- Pop-out windows render live content immediately.
- A `+` control creates terminal sessions; each can be docked together, undocked, or popped out independently.
- A system menu provides show/hide, predefined layouts, per-service reset, and logout (when auth is enabled), with room for future features.
- Setting `UBEROS_AUTH=basic` in `.env` enables proxy authentication; unset/`none` disables it, no code edits required.

## 7. Business Requirements

| BR ID | Description | Linked Objective | Stakeholders | Acceptance Criteria | Priority |
|-------|-------------|------------------|--------------|---------------------|----------|
| BR-001 | Operators can reopen any panel or tab after closing it. | BO-1 | ROS Developer | After closing any panel, a control lists it and reopening restores a working panel of that type. | Must |
| BR-002 | Pop-out ("open in new window") shows live panel content immediately. | BO-2 | ROS Developer | A popped-out panel displays working content without requiring dock/undock; verified for simulator, terminal, editor. | Must |
| BR-003 | Operators can create a new terminal session from a `+` control. | BO-3 | ROS Developer | Activating `+` opens an additional independent PTY without disturbing existing terminals. | Must |
| BR-004 | Terminal sessions can be docked together, undocked independently, and popped out as independent windows. | BO-3 | ROS Developer | Each terminal can be grouped, separated, and opened as its own window while its process keeps running. | Must |
| BR-005 | A system menu lets operators hide and show windows. | BO-1, BO-4 | ROS Developer | Menu toggles visibility of each panel; hidden panels can be shown again. | Must |
| BR-006 | The menu offers four predefined layouts the operator can apply: (1) default four equal panels, (2) simulator enlarged, (3) code editor enlarged, (4) terminal enlarged. | BO-4 | ROS Developer | Selecting any of the four presets rearranges panels to that preset. | Should |
| BR-007 | The menu can reset/restart any individual service (ros, simulator, editor, vnc, frontend) when it becomes unresponsive. | BO-4 | Platform Maintainer | Selecting reset for any service recovers it without a full stack restart; other services keep running. | Must |
| BR-008 | The menu provides logout when authentication is enabled, clearing stored credentials. | BO-4, BO-5 | Platform Maintainer | When `UBEROS_AUTH` is on, logout clears browser-stored credentials and requires re-authentication; when off, the action is hidden or disabled. | Should |
| BR-009 | The menu architecture is extensible for future capabilities (multi-user login/logout, self user management, bag record/replay). | BO-4 | Squad | New menu actions can be added without redesigning the menu; documented extension point exists. | Should |
| BR-010 | Proxy authentication is optional and controlled by `.env` (`UBEROS_AUTH`) with no code changes. | BO-5 | Platform Maintainer | With `UBEROS_AUTH=basic` and an `.htpasswd`, requests prompt for credentials; with it off, no prompt appears. | Must |
| BR-011 | Deliver a research write-up comparing Apache Guacamole to noVNC, focused on streaming performance/smoothness (including GPU impact); implementation deferred to a future improvement if Guacamole proves better. | BO-6 | Squad | Documented comparison with a recommendation and rationale, referencing the current noVNC setup; no implementation this iteration. | Should |
| BR-012 | Investigate Intel GPU and OpenVINO compatibility for the simulator overlay (using the referenced Intel GPU compose override as a starting point) and implement the OpenVINO overlay if feasible. | BO-6 | Squad | Documented feasibility vs the current NVIDIA overlay; if feasible, a working Intel/OpenVINO compose override is delivered. | Should |

## 8. Risks and Mitigations

| Risk | Impact | Mitigation |
|------|--------|------------|
| Pop-out fix interacts with iframe same-origin/BroadcastChannel behavior | Regressions in live panels | Verify against S5 pop-out isolation acceptance |
| Enabling auth breaks WebSocket routes (rosbridge, noVNC, ttyd) | Loss of core functionality | Apply auth consistently across all proxied WebSocket locations; test with auth on and off |
| Service reset partially restarts dependencies | Inconsistent state | Define per-service reset semantics and health verification |
| OpenVINO implementation proves infeasible | Wasted effort | Time-box BR-012 to research first; implement only if a clean overlay path exists |
| Guacamole research triggers premature rework | Scope creep | Keep BR-011 research-only; defer any implementation to a separately approved future improvement |

## 9. Resolved Decisions

1. Research scope: Guacamole (BR-011) is research-only; implementation deferred to a future improvement if it proves better. OpenVINO (BR-012) is implemented this iteration if feasible.
2. Predefined layouts (BR-006): four presets — default four equal panels, simulator enlarged, code editor enlarged, terminal enlarged.
3. Service reset (BR-007): covers all services (ros, simulator, editor, vnc, frontend).
4. Priority order: bugs first (BR-001, BR-002, BR-010), then the new features.
5. Pop-out target (BO-2): qualitative — content visible on pop-out, no numeric threshold.
6. Logout (BR-008): clears stored credentials and forces re-authentication.
